-- Permit drafts without geolocation; require travel fee resolution before issuing.
create or replace function public.new_quote(p_client uuid, p_site uuid default null, p_request uuid default null, p_diagnostic uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.company_settings;
  v_id uuid;
  v_km numeric;
  v_title text := '';
  di record;
begin
  perform public.assert_admin();
  select * into s from public.company_settings where id = 1;
  if p_diagnostic is not null then
    select client_id, site_id, request_id into di from public.diagnostics where id = p_diagnostic;
    p_client := coalesce(p_client, di.client_id);
    p_site := coalesce(p_site, di.site_id);
    p_request := coalesce(p_request, di.request_id);
  end if;
  if p_site is not null then
    select distance_km, coalesce(nullif(label, ''), address_line1 || ', ' || city) into v_km, v_title from public.sites where id = p_site;
  end if;

  insert into public.quotes (client_id, site_id, request_id, diagnostic_id, title, is_simulation,
                             vat_rate_bps, vat_exempt, minimum_cents, travel_distance_km, travel_fee_cents)
  values (p_client, p_site, p_request, p_diagnostic, coalesce(v_title, ''), s.mode = 'preparation',
          case when s.vat_regime = 'franchise' then 0 else s.default_vat_rate_bps end,
          s.vat_regime = 'franchise', s.minimum_charge_cents, v_km, coalesce(public.travel_fee_for_km(v_km), 0))
  returning id into v_id;

  if p_diagnostic is not null then
    insert into public.quote_lines (quote_id, position, kind, service_id, label, description, quantity, unit, unit_price_cents)
    select v_id, row_number() over (order by position), 'service', service_id,
           coalesce(nullif(label, ''), 'Prestation'), notes, quantity, unit, unit_price_cents
    from public.diagnostic_items where diagnostic_id = p_diagnostic and quantity > 0;
  end if;
  return v_id;
end;
$$;

create or replace function public.new_invoice(p_client uuid, p_site uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.company_settings;
  v_km numeric;
  v_id uuid;
begin
  perform public.assert_admin();
  select * into s from public.company_settings where id = 1;
  if p_site is not null then select distance_km into v_km from public.sites where id = p_site; end if;
  insert into public.invoices (client_id, site_id, is_simulation, vat_rate_bps, vat_exempt, minimum_cents,
                               travel_distance_km, travel_fee_cents)
  values (p_client, p_site, s.mode = 'preparation',
          case when s.vat_regime = 'franchise' then 0 else s.default_vat_rate_bps end,
          s.vat_regime = 'franchise', s.minimum_charge_cents, v_km, coalesce(public.travel_fee_for_km(v_km), 0))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.issue_quote(p_id uuid)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes;
  s public.company_settings;
  v_today date := public.paris_today();
  v_sim boolean;
  v_number text;
  v_root_number text;
begin
  perform public.assert_admin();
  select * into s from public.company_settings where id = 1;
  select * into q from public.quotes where id = p_id for update;
  if not found then raise exception 'Devis introuvable'; end if;
  if q.status <> 'brouillon' then raise exception 'Ce devis a déjà été émis.'; end if;
  if q.client_id is null then raise exception 'Associez un client avant d''émettre le devis.'; end if;
  if not exists (select 1 from public.quote_lines where quote_id = p_id and kind = 'service') then
    raise exception 'Le devis ne contient aucune prestation.';
  end if;

  if q.travel_distance_km is null and q.travel_fee_override_cents is null then
    raise exception 'Renseignez une adresse géolocalisée ou des frais de déplacement manuels avant émission.';
  end if;
  v_sim := s.mode = 'preparation';
  if q.root_id is not null then
    select number into v_root_number from public.quotes where id = q.root_id;
    if v_root_number is null then raise exception 'Le devis d''origine n''a pas de numéro.'; end if;
    v_number := v_root_number || '-V' || q.version;
    select is_simulation into v_sim from public.quotes where id = q.root_id;
  else
    v_number := public.next_document_number('devis', v_sim, v_today);
  end if;

  perform set_config('af.issuing', 'on', true);
  if s.vat_regime = 'franchise' then
    update public.quotes set vat_exempt = true, vat_rate_bps = 0 where id = p_id;
  elsif s.vat_regime = 'assujetti' then
    update public.quotes set vat_exempt = false where id = p_id;
  end if;
  perform public.recalc_document('quote', p_id);
  update public.quotes set
    number = v_number,
    is_simulation = v_sim,
    issue_date = v_today,
    valid_until = greatest(coalesce(valid_until, v_today + s.quote_validity_days), v_today),
    conditions = case when conditions = '' then s.quote_conditions else conditions end,
    sent_at = now()
  where id = p_id;
  update public.quotes set snapshot = public.document_snapshot('quote', p_id), status = 'envoye' where id = p_id
  returning * into q;
  perform set_config('af.issuing', 'off', true);

  -- Les versions précédentes encore ouvertes sont remplacées.
  if q.root_id is not null then
    update public.quotes set status = 'remplace'
    where (id = q.root_id or root_id = q.root_id) and id <> q.id and status in ('envoye', 'refuse', 'expire');
  end if;

  update public.requests set status = 'devis_envoye'
  where id = q.request_id and status in ('nouvelle', 'a_qualifier', 'diagnostic_necessaire');
  return q;
end;
$$;

create or replace function public.issue_invoice(p_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.invoices;
  orig public.invoices;
  s public.company_settings;
  v_today date := public.paris_today();
  v_sim boolean;
  v_last date;
  missing text[];
  v_already bigint;
begin
  perform public.assert_admin();
  select * into s from public.company_settings where id = 1;
  select * into i from public.invoices where id = p_id for update;
  if not found then raise exception 'Facture introuvable'; end if;
  if i.status <> 'brouillon' then raise exception 'Ce document a déjà été émis.'; end if;
  if i.client_id is null then raise exception 'Associez un client avant d''émettre.'; end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_id and kind in ('service', 'adjustment'))
     and coalesce(i.travel_fee_override_cents, i.travel_fee_cents) = 0 then
    raise exception 'Le document ne contient aucune ligne facturable.';
  end if;

  if i.kind <> 'avoir' and i.travel_distance_km is null and i.travel_fee_override_cents is null then
    raise exception 'Renseignez une adresse géolocalisée ou des frais de déplacement manuels avant émission.';
  end if;
  v_sim := s.mode = 'preparation';
  if not v_sim then
    missing := public.legal_readiness();
    if cardinality(missing) > 0 then
      raise exception 'Informations légales incomplètes : %', array_to_string(missing, ', ');
    end if;
  end if;

  if i.kind = 'avoir' then
    select * into orig from public.invoices where id = i.credited_invoice_id for update;
    if orig.status = 'brouillon' then raise exception 'La facture d''origine n''est pas émise.'; end if;
    if orig.is_simulation <> v_sim then raise exception 'L''avoir doit relever du même mode que la facture d''origine.'; end if;
  end if;

  -- Chronologie : pas de date antérieure à la dernière facture de la série.
  select max(issue_date) into v_last from public.invoices
    where kind = i.kind and is_simulation = v_sim and status <> 'brouillon';
  if v_last is not null and v_last > v_today then
    raise exception 'Incohérence chronologique avec la dernière facture émise (%).', v_last;
  end if;

  perform set_config('af.issuing', 'on', true);
  if s.vat_regime = 'franchise' then
    update public.invoices set vat_exempt = true, vat_rate_bps = 0 where id = p_id;
  elsif s.vat_regime = 'assujetti' then
    update public.invoices set vat_exempt = false where id = p_id;
  end if;
  perform public.recalc_document('invoice', p_id);

  if i.kind = 'avoir' then
    select coalesce(sum(total_ttc_cents), 0) into v_already from public.invoices
      where credited_invoice_id = orig.id and kind = 'avoir' and status <> 'brouillon';
    select * into i from public.invoices where id = p_id;
    if v_already + i.total_ttc_cents > orig.total_ttc_cents then
      raise exception 'Le total des avoirs dépasserait le montant de la facture d''origine.';
    end if;
  end if;

  update public.invoices set
    number = public.next_document_number(case when kind = 'avoir' then 'avoir' else 'facture' end, v_sim, v_today),
    is_simulation = v_sim,
    issue_date = v_today,
    service_date = coalesce(service_date, v_today),
    due_date = case when kind = 'avoir' then null
                    when due_date is null or due_date < v_today then v_today + s.payment_terms_days
                    else due_date end,
    issued_at = now()
  where id = p_id;
  update public.invoices set snapshot = public.document_snapshot('invoice', p_id), status = 'emise' where id = p_id
  returning * into i;
  perform set_config('af.issuing', 'off', true);

  if i.kind = 'avoir' then
    update public.invoices set updated_at = now() where id = i.credited_invoice_id;
  end if;
  return i;
end;
$$;

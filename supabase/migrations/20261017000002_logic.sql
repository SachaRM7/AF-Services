-- AF Nettoyage — règles métier appliquées par la base
-- Toute la logique sensible (calcul des totaux, numérotation, verrouillage des documents émis,
-- statuts de paiement) est ici, afin de ne jamais dépendre uniquement de l'interface.

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.paris_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Europe/Paris')::date $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['clients','sites','requests','diagnostics','quotes','invoices','interventions','services','company_settings'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- Distance à vol d'oiseau (formule de haversine), en kilomètres.
create or replace function public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric
language sql
immutable
as $$
  select round((2 * 6371.0088 * asin(sqrt(
      power(sin(radians((lat2 - lat1)::float8) / 2), 2)
      + cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lng2 - lng1)::float8) / 2), 2)
  )))::numeric, 2)
$$;

create or replace function public.distance_from_base_km(p_lat numeric, p_lng numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case when p_lat is null or p_lng is null then null
              else public.haversine_km(s.base_lat, s.base_lng, p_lat, p_lng) end
  from public.company_settings s where s.id = 1
$$;

-- Frais de déplacement HT pour une distance donnée : première tranche dont la borne (incluse) couvre la distance.
create or replace function public.travel_fee_for_km(p_km numeric)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case when p_km is null then 0 else coalesce((
    select b.fee_cents from public.travel_bands b
    where b.max_km is null or p_km <= b.max_km
    order by b.max_km asc nulls last
    limit 1), 0) end
$$;

create or replace function public.set_distance_from_coords()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.distance_km := public.distance_from_base_km(new.lat, new.lng);
  elsif tg_op = 'UPDATE' and (new.lat is distinct from old.lat or new.lng is distinct from old.lng) then
    new.distance_km := null;
  end if;
  return new;
end;
$$;

create trigger sites_distance before insert or update of lat, lng on public.sites
  for each row execute function public.set_distance_from_coords();

create or replace function public.set_request_distance()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.distance_km := public.distance_from_base_km(new.lat, new.lng);
    new.travel_fee_cents := public.travel_fee_for_km(new.distance_km);
  end if;
  return new;
end;
$$;

create trigger requests_distance before insert or update of lat, lng on public.requests
  for each row execute function public.set_request_distance();

-- ---------------------------------------------------------------------------
-- Configuration publique (sans données sensibles)
-- ---------------------------------------------------------------------------

create or replace function public.get_public_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'trade_name', s.trade_name,
    'tagline', s.tagline,
    'phone', s.phone,
    'email', s.email,
    'base_label', s.base_label,
    'base_lat', s.base_lat,
    'base_lng', s.base_lng,
    'manual_review_km', s.manual_review_km,
    'legal_name', s.legal_name,
    'legal_form', s.legal_form,
    'siret', s.siret,
    'address', concat_ws(', ', nullif(s.address_line1, ''), nullif(trim(s.postal_code || ' ' || s.city), '')),
    'bands', coalesce((select jsonb_agg(jsonb_build_object('max_km', b.max_km, 'fee_cents', b.fee_cents, 'label', b.label)
                                        order by b.max_km asc nulls last) from public.travel_bands b), '[]'::jsonb)
  )
  from public.company_settings s where s.id = 1
$$;

-- Liste des informations légales manquantes pour passer en mode exploitation.
create or replace function public.legal_readiness()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.company_settings;
  missing text[] := '{}';
begin
  select * into s from public.company_settings where id = 1;
  if s.legal_name = '' then missing := array_append(missing, 'Dénomination / nom légal'::text); end if;
  if s.legal_form = '' then missing := array_append(missing, 'Forme juridique'::text); end if;
  if s.siren = '' then missing := array_append(missing, 'SIREN'::text); end if;
  if s.siret = '' then missing := array_append(missing, 'SIRET'::text); end if;
  if s.siren <> '' and s.siret <> '' and left(s.siret, 9) <> s.siren then missing := array_append(missing, 'SIRET incohérent avec le SIREN'::text); end if;
  if s.address_line1 = '' or s.postal_code = '' or s.city = '' then missing := array_append(missing, 'Adresse professionnelle'::text); end if;
  if s.vat_regime = 'a_definir' then missing := array_append(missing, 'Régime de TVA'::text); end if;
  if s.vat_regime = 'assujetti' and s.vat_number = '' then missing := array_append(missing, 'Numéro de TVA intracommunautaire'::text); end if;
  if s.iban = '' then missing := array_append(missing, 'IBAN'::text); end if;
  if s.email = '' and s.phone = '' then missing := array_append(missing, 'Coordonnées de contact'::text); end if;
  return missing;
end;
$$;

create or replace function public.set_operating_mode(p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  missing text[];
begin
  perform public.assert_admin();
  if p_mode not in ('preparation', 'exploitation') then
    raise exception 'Mode inconnu : %', p_mode;
  end if;
  if p_mode = 'exploitation' then
    missing := public.legal_readiness();
    if cardinality(missing) > 0 then
      raise exception 'Informations légales incomplètes : %', array_to_string(missing, ', ');
    end if;
    perform set_config('af.mode_change', 'on', true);
    update public.company_settings set mode = 'exploitation', exploitation_since = coalesce(exploitation_since, now()) where id = 1;
  else
    if exists (select 1 from public.invoices where not is_simulation and status <> 'brouillon') then
      raise exception 'Des factures réelles ont déjà été émises : retour au mode préparation impossible.';
    end if;
    perform set_config('af.mode_change', 'on', true);
    update public.company_settings set mode = 'preparation' where id = 1;
  end if;
  perform set_config('af.mode_change', 'off', true);
end;
$$;

-- Les champs légaux ne peuvent pas être vidés une fois en exploitation.
create or replace function public.guard_company_settings()
returns trigger
language plpgsql
as $$
begin
  if new.mode = 'exploitation' and old.mode = 'exploitation' then
    if new.legal_name = '' or new.siret = '' or new.siren = '' or new.vat_regime = 'a_definir' or new.iban = '' then
      raise exception 'En mode exploitation, les informations légales obligatoires ne peuvent pas être effacées.';
    end if;
  end if;
  if (new.mode, new.exploitation_since) is distinct from (old.mode, old.exploitation_since)
     and current_setting('af.mode_change', true) is distinct from 'on' then
    raise exception 'Le changement de mode passe par l''action dédiée (vérification des informations légales).';
  end if;
  return new;
end;
$$;

create trigger company_settings_guard before update on public.company_settings
  for each row execute function public.guard_company_settings();

-- ---------------------------------------------------------------------------
-- Calcul des totaux (miroir exact de src/lib/pricing.ts)
-- ---------------------------------------------------------------------------

create or replace function public.recalc_document(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  v_gross bigint := 0;
  v_adj bigint := 0;
  v_has_service boolean := false;
  v_min_adj bigint := 0;
  v_travel bigint;
  v_ht bigint;
  v_vat bigint;
  v_prev text := current_setting('af.recalc', true);
begin
  perform set_config('af.recalc', 'on', true);

  if p_kind = 'quote' then
    select status, apply_minimum, minimum_cents, travel_fee_cents, travel_fee_override_cents, vat_rate_bps, vat_exempt
      into d from public.quotes where id = p_id;
  else
    select status, apply_minimum, minimum_cents, travel_fee_cents, travel_fee_override_cents, vat_rate_bps, vat_exempt
      into d from public.invoices where id = p_id;
  end if;
  if not found or d.status <> 'brouillon' then
    perform set_config('af.recalc', coalesce(v_prev, 'off'), true);
    return;
  end if;

  -- 1. lignes de prestation : round(qté × PU) puis remise de ligne
  if p_kind = 'quote' then
    update public.quote_lines set total_ht_cents =
      case kind
        when 'service' then round(round(quantity * unit_price_cents) * (10000 - discount_bps) / 10000.0)::bigint
        when 'note' then 0
        else total_ht_cents end
    where quote_id = p_id and kind in ('service', 'note');
    select coalesce(sum(total_ht_cents), 0), count(*) > 0 into v_gross, v_has_service
      from public.quote_lines where quote_id = p_id and kind = 'service';
    -- 2. remises / majorations : en % du sous-total des prestations, ou montant fixe
    update public.quote_lines set total_ht_cents =
      case when percent_bps is not null then round(v_gross::numeric * percent_bps / 10000.0)::bigint
           else round(quantity * unit_price_cents)::bigint end
    where quote_id = p_id and kind = 'adjustment';
    select coalesce(sum(total_ht_cents), 0) into v_adj from public.quote_lines where quote_id = p_id and kind = 'adjustment';
  else
    update public.invoice_lines set total_ht_cents =
      case kind
        when 'service' then round(round(quantity * unit_price_cents) * (10000 - discount_bps) / 10000.0)::bigint
        when 'note' then 0
        else total_ht_cents end
    where invoice_id = p_id and kind in ('service', 'note');
    select coalesce(sum(total_ht_cents), 0), count(*) > 0 into v_gross, v_has_service
      from public.invoice_lines where invoice_id = p_id and kind = 'service';
    update public.invoice_lines set total_ht_cents =
      case when percent_bps is not null then round(v_gross::numeric * percent_bps / 10000.0)::bigint
           else round(quantity * unit_price_cents)::bigint end
    where invoice_id = p_id and kind = 'adjustment';
    select coalesce(sum(total_ht_cents), 0) into v_adj from public.invoice_lines where invoice_id = p_id and kind = 'adjustment';
  end if;

  -- 3. minimum de prestation, appliqué au total des prestations (hors déplacement)
  if d.apply_minimum and v_has_service and v_gross + v_adj < d.minimum_cents then
    v_min_adj := d.minimum_cents - (v_gross + v_adj);
  end if;

  -- 4. déplacement, ligne distincte
  v_travel := coalesce(d.travel_fee_override_cents, d.travel_fee_cents);

  v_ht := v_gross + v_adj + v_min_adj + v_travel;
  v_vat := case when d.vat_exempt then 0 else round(v_ht::numeric * d.vat_rate_bps / 10000.0)::bigint end;

  if p_kind = 'quote' then
    update public.quotes set services_gross_cents = v_gross, adjustments_cents = v_adj,
      minimum_adjustment_cents = v_min_adj, travel_billed_cents = v_travel,
      total_ht_cents = v_ht, total_vat_cents = v_vat, total_ttc_cents = v_ht + v_vat
    where id = p_id;
  else
    update public.invoices set services_gross_cents = v_gross, adjustments_cents = v_adj,
      minimum_adjustment_cents = v_min_adj, travel_billed_cents = v_travel,
      total_ht_cents = v_ht, total_vat_cents = v_vat, total_ttc_cents = v_ht + v_vat
    where id = p_id;
  end if;

  perform set_config('af.recalc', coalesce(v_prev, 'off'), true);
end;
$$;

-- Lignes : verrouillage si le document parent n'est plus un brouillon, puis recalcul.
create or replace function public.document_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc uuid;
  v_status text;
begin
  if current_setting('af.recalc', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'quote_lines' then
    v_doc := coalesce(new.quote_id, old.quote_id);
    select status into v_status from public.quotes where id = v_doc;
  else
    v_doc := coalesce(new.invoice_id, old.invoice_id);
    select status into v_status from public.invoices where id = v_doc;
  end if;
  if v_status is not null and v_status <> 'brouillon' then
    raise exception 'Document émis : ses lignes ne sont plus modifiables (créez une nouvelle version ou un avoir).'
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if tg_table_name = 'quote_lines' then
      if new.quote_id <> old.quote_id then raise exception 'Une ligne ne peut pas changer de document.'; end if;
    elsif new.invoice_id <> old.invoice_id then
      raise exception 'Une ligne ne peut pas changer de document.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.document_lines_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('af.recalc', true) = 'on' then
    return null;
  end if;
  if tg_table_name = 'quote_lines' then
    perform public.recalc_document('quote', coalesce(new.quote_id, old.quote_id));
  else
    perform public.recalc_document('invoice', coalesce(new.invoice_id, old.invoice_id));
  end if;
  return null;
end;
$$;

create trigger quote_lines_guard before insert or update or delete on public.quote_lines
  for each row execute function public.document_lines_guard();
create trigger quote_lines_after after insert or update or delete on public.quote_lines
  for each row execute function public.document_lines_after();
create trigger invoice_lines_guard before insert or update or delete on public.invoice_lines
  for each row execute function public.document_lines_guard();
create trigger invoice_lines_after after insert or update or delete on public.invoice_lines
  for each row execute function public.document_lines_after();

-- ---------------------------------------------------------------------------
-- Devis : verrouillage, transitions
-- ---------------------------------------------------------------------------

create or replace function public.quotes_guard()
returns trigger
language plpgsql
as $$
declare
  allowed text[] := array['status', 'decided_at', 'pdf_path', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'brouillon' then
      raise exception 'Un devis envoyé ne peut pas être supprimé (utilisez le statut « annulé »).';
    end if;
    return old;
  end if;

  if old.status = 'brouillon' then
    if new.status not in ('brouillon', 'envoye') then
      raise exception 'Un brouillon de devis doit d''abord être émis.';
    end if;
    if new.status = 'envoye' and current_setting('af.issuing', true) is distinct from 'on' then
      raise exception 'Utilisez l''action « Émettre le devis » pour envoyer un devis.';
    end if;
    if current_setting('af.recalc', true) is distinct from 'on' and current_setting('af.issuing', true) is distinct from 'on' then
      -- les totaux sont calculés par la base uniquement
      new.services_gross_cents := old.services_gross_cents;
      new.adjustments_cents := old.adjustments_cents;
      new.minimum_adjustment_cents := old.minimum_adjustment_cents;
      new.travel_billed_cents := old.travel_billed_cents;
      new.total_ht_cents := old.total_ht_cents;
      new.total_vat_cents := old.total_vat_cents;
      new.total_ttc_cents := old.total_ttc_cents;
      new.number := old.number;
      new.snapshot := old.snapshot;
    end if;
    return new;
  end if;

  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Devis émis : son contenu n''est plus modifiable. Créez une nouvelle version.';
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'envoye' and new.status in ('accepte', 'refuse', 'expire', 'annule', 'remplace'))
      or (old.status in ('refuse', 'expire') and new.status in ('envoye', 'remplace'))
      or (old.status = 'accepte' and new.status = 'annule')
    ) then
      raise exception 'Transition de statut impossible : % → %', old.status, new.status;
    end if;
    if new.status in ('accepte', 'refuse') then
      new.decided_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger quotes_guard before update or delete on public.quotes
  for each row execute function public.quotes_guard();

create or replace function public.documents_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('af.recalc', true) = 'on' or new.status <> 'brouillon' then
    return null;
  end if;
  if (new.apply_minimum, new.minimum_cents, new.travel_fee_cents, new.travel_fee_override_cents, new.vat_rate_bps, new.vat_exempt)
     is distinct from
     (old.apply_minimum, old.minimum_cents, old.travel_fee_cents, old.travel_fee_override_cents, old.vat_rate_bps, old.vat_exempt) then
    perform public.recalc_document(case tg_table_name when 'quotes' then 'quote' else 'invoice' end, new.id);
  end if;
  return null;
end;
$$;

create trigger quotes_after_update after update on public.quotes
  for each row execute function public.documents_after_update();

create or replace function public.documents_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalc_document(case tg_table_name when 'quotes' then 'quote' else 'invoice' end, new.id);
  return null;
end;
$$;

create trigger quotes_after_insert after insert on public.quotes
  for each row execute function public.documents_after_insert();

-- ---------------------------------------------------------------------------
-- Factures : verrouillage, statut de paiement dérivé
-- ---------------------------------------------------------------------------

create or replace function public.invoices_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[] := array['status', 'paid_cents', 'credited_cents', 'pdf_path', 'einvoice_status', 'einvoice_reference', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'brouillon' then
      raise exception 'Une facture émise ne peut pas être supprimée. Établissez un avoir.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'brouillon' then
      raise exception 'Une facture est toujours créée en brouillon.';
    end if;
    new.number := null;
    new.snapshot := null;
    new.paid_cents := 0;
    new.credited_cents := 0;
    return new;
  end if;

  if old.status = 'brouillon' then
    if new.status <> 'brouillon' and current_setting('af.issuing', true) is distinct from 'on' then
      raise exception 'Utilisez l''action « Émettre la facture ».';
    end if;
    if current_setting('af.recalc', true) is distinct from 'on' and current_setting('af.issuing', true) is distinct from 'on' then
      new.services_gross_cents := old.services_gross_cents;
      new.adjustments_cents := old.adjustments_cents;
      new.minimum_adjustment_cents := old.minimum_adjustment_cents;
      new.travel_billed_cents := old.travel_billed_cents;
      new.total_ht_cents := old.total_ht_cents;
      new.total_vat_cents := old.total_vat_cents;
      new.total_ttc_cents := old.total_ttc_cents;
      new.number := old.number;
      new.snapshot := old.snapshot;
      new.paid_cents := 0;
      new.credited_cents := 0;
    end if;
    return new;
  end if;

  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Facture émise : son contenu n''est plus modifiable. Les corrections passent par un avoir.';
  end if;

  -- Montants réglés et crédités toujours recalculés depuis la source.
  if new.kind = 'facture' then
    select coalesce(sum(amount_cents), 0) into new.paid_cents from public.payments where invoice_id = new.id;
    select coalesce(sum(total_ttc_cents), 0) into new.credited_cents
      from public.invoices where credited_invoice_id = new.id and kind = 'avoir' and status <> 'brouillon';
    new.status := case
      when new.credited_cents >= new.total_ttc_cents then 'annulee'
      when new.paid_cents + new.credited_cents >= new.total_ttc_cents then 'payee'
      when new.paid_cents > 0 then 'partiellement_payee'
      else 'emise' end;
  else
    new.status := 'emise';
    new.paid_cents := 0;
    new.credited_cents := 0;
  end if;
  return new;
end;
$$;

create trigger invoices_guard before insert or update or delete on public.invoices
  for each row execute function public.invoices_guard();
create trigger invoices_after_update after update on public.invoices
  for each row execute function public.documents_after_update();
create trigger invoices_after_insert after insert on public.invoices
  for each row execute function public.documents_after_insert();

create or replace function public.payments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
  v_paid bigint;
begin
  select * into inv from public.invoices where id = coalesce(new.invoice_id, old.invoice_id) for update;
  if tg_op in ('INSERT', 'UPDATE') then
    if inv.kind <> 'facture' or inv.status = 'brouillon' then
      raise exception 'Un règlement ne peut être enregistré que sur une facture émise.';
    end if;
    if inv.status = 'annulee' then
      raise exception 'Facture annulée par avoir : aucun règlement possible.';
    end if;
    select coalesce(sum(amount_cents), 0) into v_paid from public.payments
      where invoice_id = inv.id and id <> new.id;
    if v_paid + new.amount_cents > inv.total_ttc_cents - inv.credited_cents then
      raise exception 'Le règlement dépasse le reste à payer (% centimes).', inv.total_ttc_cents - inv.credited_cents - v_paid;
    end if;
    return new;
  end if;
  return old;
end;
$$;

create or replace function public.payments_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invoices set updated_at = now() where id = coalesce(new.invoice_id, old.invoice_id);
  return null;
end;
$$;

create trigger payments_guard before insert or update or delete on public.payments
  for each row execute function public.payments_guard();
create trigger payments_after after insert or update or delete on public.payments
  for each row execute function public.payments_after();

-- ---------------------------------------------------------------------------
-- Numérotation
-- ---------------------------------------------------------------------------

create or replace function public.next_document_number(p_type text, p_simulation boolean, p_date date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from p_date)::integer;
  v_value integer;
  v_prefix text := case p_type when 'devis' then 'D' when 'facture' then 'F' else 'AV' end;
begin
  insert into public.document_sequences (doc_type, year, simulation, last_value)
  values (p_type, v_year, p_simulation, 1)
  on conflict (doc_type, year, simulation) do update set last_value = public.document_sequences.last_value + 1
  returning last_value into v_value;
  return (case when p_simulation then 'SIM-' else '' end) || v_prefix || '-' || v_year || '-' || lpad(v_value::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Instantanés
-- ---------------------------------------------------------------------------

create or replace function public.seller_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(s) - array['id', 'updated_at', 'base_lat', 'base_lng', 'distance_method', 'manual_review_km', 'einvoicing_platform']
  from public.company_settings s where s.id = 1
$$;

create or replace function public.document_snapshot(p_kind text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_doc jsonb;
  v_client jsonb;
  v_site jsonb;
  v_lines jsonb;
  v_client_id uuid;
  v_site_id uuid;
begin
  if p_kind = 'quote' then
    select to_jsonb(q) - array['snapshot'], q.client_id, q.site_id into v_doc, v_client_id, v_site_id from public.quotes q where q.id = p_id;
    select coalesce(jsonb_agg(to_jsonb(l) - array['quote_id'] order by l.position, l.id), '[]'::jsonb) into v_lines
      from public.quote_lines l where l.quote_id = p_id;
  else
    select to_jsonb(i) - array['snapshot'], i.client_id, i.site_id into v_doc, v_client_id, v_site_id from public.invoices i where i.id = p_id;
    select coalesce(jsonb_agg(to_jsonb(l) - array['invoice_id'] order by l.position, l.id), '[]'::jsonb) into v_lines
      from public.invoice_lines l where l.invoice_id = p_id;
  end if;
  select to_jsonb(c) - array['notes', 'archived'] into v_client from public.clients c where c.id = v_client_id;
  select to_jsonb(s) into v_site from public.sites s where s.id = v_site_id;
  return jsonb_build_object(
    'seller', public.seller_snapshot(),
    'client', v_client,
    'site', v_site,
    'document', v_doc,
    'lines', v_lines,
    'frozen_at', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Émission
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Création de documents
-- ---------------------------------------------------------------------------

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
          s.vat_regime = 'franchise', s.minimum_charge_cents, v_km, public.travel_fee_for_km(v_km))
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

create or replace function public.copy_quote(p_id uuid, p_as_version boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes;
  v_id uuid;
  v_root uuid;
  v_version integer := 1;
  s public.company_settings;
begin
  perform public.assert_admin();
  select * into s from public.company_settings where id = 1;
  select * into q from public.quotes where id = p_id;
  if not found then raise exception 'Devis introuvable'; end if;
  if p_as_version then
    if q.status = 'brouillon' then raise exception 'Un brouillon se modifie directement.'; end if;
    v_root := coalesce(q.root_id, q.id);
    select max(version) + 1 into v_version from public.quotes where id = v_root or root_id = v_root;
    if exists (select 1 from public.quotes where (id = v_root or root_id = v_root) and status = 'brouillon') then
      raise exception 'Une nouvelle version est déjà en préparation.';
    end if;
  end if;

  insert into public.quotes (root_id, version, client_id, site_id, request_id, diagnostic_id, title, conditions, notes,
    is_simulation, vat_rate_bps, vat_exempt, apply_minimum, minimum_cents, travel_distance_km, travel_fee_cents,
    travel_fee_override_cents, travel_override_reason, recurrence_text)
  values (v_root, v_version, q.client_id, q.site_id, q.request_id, q.diagnostic_id, q.title,
    case when p_as_version then q.conditions else '' end, q.notes,
    case when p_as_version then q.is_simulation else s.mode = 'preparation' end,
    q.vat_rate_bps, q.vat_exempt, q.apply_minimum, q.minimum_cents, q.travel_distance_km, q.travel_fee_cents,
    q.travel_fee_override_cents, q.travel_override_reason, q.recurrence_text)
  returning id into v_id;

  insert into public.quote_lines (quote_id, position, kind, service_id, label, description, quantity, unit, unit_price_cents, discount_bps, percent_bps)
  select v_id, position, kind, service_id, label, description, quantity, unit, unit_price_cents, discount_bps, percent_bps
  from public.quote_lines where quote_id = p_id order by position;
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
          s.vat_regime = 'franchise', s.minimum_charge_cents, v_km, public.travel_fee_for_km(v_km))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.invoice_from_quote(p_quote uuid, p_service_date date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes;
  s public.company_settings;
  v_id uuid;
begin
  perform public.assert_admin();
  select * into s from public.company_settings where id = 1;
  select * into q from public.quotes where id = p_quote;
  if not found then raise exception 'Devis introuvable'; end if;
  if q.status <> 'accepte' then raise exception 'Seul un devis accepté peut être transformé en facture.'; end if;

  insert into public.invoices (client_id, site_id, quote_id, title, service_date, is_simulation, vat_rate_bps, vat_exempt,
    apply_minimum, minimum_cents, travel_distance_km, travel_fee_cents, travel_fee_override_cents, travel_override_reason, notes)
  values (q.client_id, q.site_id, q.id, q.title, p_service_date, s.mode = 'preparation', q.vat_rate_bps, q.vat_exempt,
    q.apply_minimum, q.minimum_cents, q.travel_distance_km, q.travel_fee_cents, q.travel_fee_override_cents,
    q.travel_override_reason, case when q.number is not null then 'Selon devis n° ' || q.number else '' end)
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, position, kind, service_id, label, description, quantity, unit, unit_price_cents, discount_bps, percent_bps)
  select v_id, position, kind, service_id, label, description, quantity, unit, unit_price_cents, discount_bps, percent_bps
  from public.quote_lines where quote_id = p_quote order by position;

  update public.requests set status = 'acceptee' where id = q.request_id and status = 'devis_envoye';
  return v_id;
end;
$$;

create or replace function public.invoice_from_intervention(p_intervention uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.interventions;
  v_id uuid;
  v_date date;
begin
  perform public.assert_admin();
  select * into it from public.interventions where id = p_intervention for update;
  if not found then raise exception 'Intervention introuvable'; end if;
  if it.invoice_id is not null then return it.invoice_id; end if;
  if it.client_id is null then raise exception 'Intervention sans client.'; end if;
  v_date := (it.starts_at at time zone 'Europe/Paris')::date;

  if it.quote_id is not null and exists (select 1 from public.quotes where id = it.quote_id and status = 'accepte') then
    v_id := public.invoice_from_quote(it.quote_id, v_date);
  else
    v_id := public.new_invoice(it.client_id, it.site_id);
    update public.invoices set service_date = v_date, title = it.title where id = v_id;
    if it.planned_services <> '' then
      insert into public.invoice_lines (invoice_id, position, kind, label, quantity, unit, unit_price_cents)
      values (v_id, 1, 'note', it.planned_services, 0, 'unite', 0);
    end if;
  end if;
  update public.interventions set invoice_id = v_id where id = p_intervention;
  return v_id;
end;
$$;

create or replace function public.credit_note_for(p_invoice uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.invoices;
  v_id uuid;
  v_pos integer;
begin
  perform public.assert_admin();
  select * into f from public.invoices where id = p_invoice;
  if not found or f.kind <> 'facture' then raise exception 'Facture introuvable'; end if;
  if f.status = 'brouillon' then raise exception 'Un brouillon se corrige directement, sans avoir.'; end if;
  if f.status = 'annulee' then raise exception 'Cette facture est déjà intégralement créditée.'; end if;

  insert into public.invoices (kind, credited_invoice_id, client_id, site_id, quote_id, title, service_date, is_simulation,
    vat_rate_bps, vat_exempt, apply_minimum, minimum_cents, travel_distance_km, travel_fee_cents, travel_fee_override_cents,
    travel_override_reason, notes)
  values ('avoir', f.id, f.client_id, f.site_id, f.quote_id, 'Avoir sur facture ' || f.number, f.service_date, f.is_simulation,
    f.vat_rate_bps, f.vat_exempt, false, 0, f.travel_distance_km, 0, f.travel_billed_cents, f.travel_override_reason,
    'Avoir relatif à la facture n° ' || f.number || ' du ' || to_char(f.issue_date, 'DD/MM/YYYY'))
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, position, kind, service_id, label, description, quantity, unit, unit_price_cents, discount_bps, percent_bps)
  select v_id, position, kind, service_id, label, description, quantity, unit, unit_price_cents, discount_bps, percent_bps
  from public.invoice_lines where invoice_id = p_invoice order by position;

  if f.minimum_adjustment_cents > 0 then
    select coalesce(max(position), 0) + 1 into v_pos from public.invoice_lines where invoice_id = v_id;
    insert into public.invoice_lines (invoice_id, position, kind, label, quantity, unit, unit_price_cents)
    values (v_id, v_pos, 'adjustment', 'Complément minimum de prestation', 1, 'forfait', f.minimum_adjustment_cents);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Demandes → clients / diagnostics
-- ---------------------------------------------------------------------------

create or replace function public.convert_request(p_request uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
  v_client uuid;
  v_site uuid;
begin
  perform public.assert_admin();
  select * into r from public.requests where id = p_request for update;
  if not found then raise exception 'Demande introuvable'; end if;
  v_client := r.client_id;
  if v_client is null and r.email <> '' then
    select id into v_client from public.clients where lower(email) = lower(r.email) and not archived limit 1;
  end if;
  if v_client is null then
    insert into public.clients (kind, first_name, last_name, company_name, email, phone,
                                billing_address_line1, billing_postal_code, billing_city)
    values (r.customer_type, r.first_name, r.last_name, r.company_name, r.email, r.phone,
            r.address_line1, r.postal_code, r.city)
    returning id into v_client;
  end if;
  v_site := r.site_id;
  if v_site is null and r.address_line1 <> '' then
    select id into v_site from public.sites
      where client_id = v_client and lower(address_line1) = lower(r.address_line1) and postal_code = r.postal_code limit 1;
    if v_site is null then
      insert into public.sites (client_id, address_line1, postal_code, city, lat, lng, access_notes)
      values (v_client, r.address_line1, r.postal_code, r.city, r.lat, r.lng, r.access_info)
      returning id into v_site;
    end if;
  end if;
  update public.requests set client_id = v_client, site_id = v_site,
    status = case when status = 'nouvelle' then 'a_qualifier' else status end
  where id = p_request;
  return v_client;
end;
$$;

create or replace function public.diagnostic_from_request(p_request uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
  v_id uuid;
  v_pos integer := 0;
  c record;
begin
  perform public.assert_admin();
  perform public.convert_request(p_request);
  select * into r from public.requests where id = p_request;
  insert into public.diagnostics (client_id, site_id, request_id, frequency, accessibility, observations, created_by)
  values (r.client_id, r.site_id, r.id, coalesce(nullif(r.frequency, ''), 'ponctuelle'), r.access_info, r.message, auth.uid())
  returning id into v_id;
  for c in
    select distinct on (sc.id) sc.slug, sv.id as service_id, sv.name, sv.unit, sv.unit_price_cents
    from public.service_categories sc
    join public.services sv on sv.category_id = sc.id and sv.active
    where sc.slug = any (r.category_slugs)
    order by sc.id, sv.sort_order
  loop
    v_pos := v_pos + 1;
    insert into public.diagnostic_items (diagnostic_id, position, service_id, label, quantity, unit, unit_price_cents)
    values (v_id, v_pos, c.service_id, c.name,
            case when c.unit = 'm2' and r.surface_m2 is not null then r.surface_m2 else 0 end,
            c.unit, c.unit_price_cents);
  end loop;
  update public.requests set status = 'diagnostic_necessaire' where id = p_request and status in ('nouvelle', 'a_qualifier');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Récurrences : génération des interventions
-- ---------------------------------------------------------------------------

create or replace function public.generate_recurrence(p_id uuid, p_until date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recurrences;
  d date;
  v_count integer := 0;
  v_start timestamptz;
  v_end date;
  v_month date;
  v_day integer;
  v_days integer[];
  v_len integer;
  i integer;
  v_occ date[] := '{}';
begin
  perform public.assert_admin();
  select * into r from public.recurrences where id = p_id;
  if not found then raise exception 'Récurrence introuvable'; end if;
  if not r.active then return 0; end if;
  v_end := least(p_until, coalesce(r.end_date, p_until), r.start_date + 400);

  -- Dates candidates
  if r.rule in ('hebdomadaire', 'bimensuelle') then
    d := r.start_date;
    while d <= v_end loop
      v_occ := array_append(v_occ, d);
      d := d + case when r.rule = 'hebdomadaire' then 7 else 14 end;
    end loop;
  else
    -- mensuelle : même jour chaque mois (borné au dernier jour du mois) ;
    -- deux fois par mois : jour J et J ± 15.
    v_day := extract(day from r.start_date)::int;
    v_days := case when r.rule = 'mensuelle' then array[v_day]
                   when v_day <= 15 then array[v_day, v_day + 15]
                   else array[v_day - 15, v_day] end;
    v_month := date_trunc('month', r.start_date)::date;
    while v_month <= v_end loop
      v_len := extract(day from (v_month + interval '1 month' - interval '1 day'))::int;
      foreach i in array v_days loop
        d := v_month + (least(i, v_len) - 1);
        if d >= r.start_date and d <= v_end then v_occ := array_append(v_occ, d); end if;
      end loop;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end if;

  for d in select distinct o from unnest(v_occ) o where o >= public.paris_today() order by 1 loop
    v_start := (d + r.start_time) at time zone 'Europe/Paris';
    insert into public.interventions (client_id, site_id, quote_id, recurrence_id, title, starts_at, ends_at, assignee, notes)
    values (r.client_id, r.site_id, r.quote_id, r.id, r.title, v_start, v_start + make_interval(mins => r.duration_minutes), r.assignee, r.notes)
    on conflict do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Journal des actions (traçabilité)
-- ---------------------------------------------------------------------------

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := null;
  v_old jsonb;
  v_new jsonb;
  v_id text;
  v_email text;
  k text;
  v_summary text;
begin
  if current_setting('af.recalc', true) = 'on' and tg_op = 'UPDATE' then
    return null;
  end if;
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) - array['snapshot', 'updated_at'] end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) - array['snapshot', 'updated_at'] end;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  if tg_op = 'UPDATE' then
    v_changes := '{}'::jsonb;
    for k in select jsonb_object_keys(v_new) loop
      if (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return null; end if;
  elsif tg_op = 'DELETE' then
    v_changes := v_old;
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  v_summary := coalesce(v_new ->> 'number', v_old ->> 'number', v_new ->> 'display_name', v_old ->> 'display_name',
                        v_new ->> 'name', v_new ->> 'label', '');
  insert into public.audit_log (actor_id, actor_email, action, table_name, record_id, summary, changes)
  values (auth.uid(), v_email, lower(tg_op), tg_table_name, v_id, v_summary, v_changes);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['clients','sites','requests','diagnostics','quotes','invoices','payments','interventions',
                           'recurrences','services','service_categories','company_settings','travel_bands','expenses','profiles'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

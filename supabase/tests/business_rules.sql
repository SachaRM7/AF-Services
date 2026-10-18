-- Tests des règles métier appliquées par la base (exécutés par scripts/test-db.sh).
\set QUIET on
\set ON_ERROR_STOP on

insert into public.admin_allowlist (email, full_name) values ('adel@example.test', 'Adel Ferchichi');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'adel@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'intrus@example.test');

create or replace function pg_temp.expect_error(p_sql text, p_like text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not ilike p_like then
      raise exception 'Erreur inattendue pour [%] : %', p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Une erreur était attendue pour : %', p_sql;
end $$;

create or replace function pg_temp.eq(p_actual anyelement, p_expected anyelement, p_label text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'ÉCHEC % : obtenu %, attendu %', p_label, p_actual, p_expected;
  end if;
end $$;

grant execute on function pg_temp.expect_error(text, text) to anon, authenticated;

-- 1. Profils créés uniquement pour les adresses autorisées
select pg_temp.eq((select count(*) from public.profiles), 1::bigint, 'profil admin créé via allowlist');

-- 2. Anonyme : configuration publique seulement
set role anon;
select pg_temp.eq((select count(*) from public.clients), 0::bigint, 'anon ne voit aucun client');
select pg_temp.eq((select count(*) from public.travel_bands), 4::bigint, 'anon voit les tranches');
select pg_temp.eq((public.get_public_config() ->> 'trade_name'), 'AF Nettoyage', 'config publique');
select pg_temp.eq((public.get_public_config() ? 'iban'), false, 'pas d''IBAN dans la config publique');
select pg_temp.expect_error('select public.issue_invoice(gen_random_uuid())', '%permission denied%');
reset role;

-- 3. Authentifié non administrateur : aucun accès
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.eq((select count(*) from public.company_settings), 0::bigint, 'non-admin ne lit pas les paramètres');
select pg_temp.expect_error($$insert into public.clients (kind, last_name) values ('particulier', 'X')$$, '%row-level security%');
select pg_temp.expect_error('select public.new_invoice(null, null)', '%réservé aux administrateurs%');
reset role;

-- 4. Administrateur : parcours complet
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

select pg_temp.eq(public.travel_fee_for_km(0), 500::bigint, 'tranche 0 km');
select pg_temp.eq(public.travel_fee_for_km(5), 500::bigint, 'tranche 5 km inclus');
select pg_temp.eq(public.travel_fee_for_km(5.01), 1000::bigint, 'tranche > 5 km');
select pg_temp.eq(public.travel_fee_for_km(15), 1500::bigint, 'tranche 15 km inclus');
select pg_temp.eq(public.travel_fee_for_km(42), 2000::bigint, 'tranche > 15 km');

insert into public.clients (id, kind, first_name, last_name, email)
values ('10000000-0000-0000-0000-000000000001', 'particulier', 'Marie', 'Durand', 'marie@example.test');
-- Colomiers (≈ 9,5 km d'Empalot)
insert into public.sites (id, client_id, address_line1, postal_code, city, lat, lng)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '1 allée du Rouergue', '31770', 'Colomiers', 43.6115, 1.3350);
do $$ begin
  perform pg_temp.eq((select distance_km between 9 and 10 from public.sites where id = '20000000-0000-0000-0000-000000000001'), true, 'distance Colomiers');
end $$;

create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated;
insert into t_ids values ('q1', public.new_quote('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'));

-- Exemple du cahier des charges : 25 € de prestation → minimum 40 €, + 10 € de déplacement = 50 € HT
insert into public.quote_lines (quote_id, position, kind, label, quantity, unit, unit_price_cents)
select id, 1, 'service', 'Vitres', 8.333, 'm2', 300 from t_ids where k = 'q1';
do $$
declare q public.quotes;
begin
  select * into q from public.quotes where id = (select id from t_ids where k = 'q1');
  perform pg_temp.eq(q.services_gross_cents, 2500::bigint, 'arrondi 8,333 m² × 3 €');
  perform pg_temp.eq(q.minimum_adjustment_cents, 1500::bigint, 'complément minimum');
  perform pg_temp.eq(q.travel_billed_cents, 1000::bigint, 'déplacement Colomiers');
  perform pg_temp.eq(q.total_ht_cents, 5000::bigint, 'total HT exemple');
  perform pg_temp.eq(q.total_vat_cents, 1000::bigint, 'TVA 20 %');
  perform pg_temp.eq(q.total_ttc_cents, 6000::bigint, 'total TTC');
end $$;

-- Remise globale de 10 % et majoration fixe ; minimum calculé sur le total des prestations
insert into public.quote_lines (quote_id, position, kind, label, quantity, unit, unit_price_cents, discount_bps)
select id, 2, 'service', 'Bureaux', 2, 'heure', 3000, 1000 from t_ids where k = 'q1';
insert into public.quote_lines (quote_id, position, kind, label, percent_bps)
select id, 3, 'adjustment', 'Remise fidélité', -1000 from t_ids where k = 'q1';
do $$
declare q public.quotes;
begin
  select * into q from public.quotes where id = (select id from t_ids where k = 'q1');
  -- 2500 + 5400 = 7900 ; -10 % = -790 ; prestations 7110 ≥ 4000
  perform pg_temp.eq(q.services_gross_cents, 7900::bigint, 'sous-total prestations');
  perform pg_temp.eq(q.adjustments_cents, -790::bigint, 'remise %');
  perform pg_temp.eq(q.minimum_adjustment_cents, 0::bigint, 'minimum non appliqué');
  perform pg_temp.eq(q.total_ht_cents, 8110::bigint, 'total HT avec déplacement');
end $$;

-- Frais de déplacement modifiés par l'administrateur
update public.quotes set travel_fee_override_cents = 0, travel_override_reason = 'Geste commercial'
where id = (select id from t_ids where k = 'q1');
select pg_temp.eq((select total_ht_cents from public.quotes where id = (select id from t_ids where k = 'q1')), 7110::bigint, 'déplacement offert');

-- Les totaux ne peuvent pas être forcés
update public.quotes set total_ht_cents = 1 where id = (select id from t_ids where k = 'q1');
select pg_temp.eq((select total_ht_cents from public.quotes where id = (select id from t_ids where k = 'q1')), 7110::bigint, 'totaux protégés');

-- Envoi direct interdit sans émission
select pg_temp.expect_error(format($$update public.quotes set status = 'envoye' where id = %L$$, (select id from t_ids where k = 'q1')), '%Émettre%');

-- Émission
select pg_temp.eq((public.issue_quote((select id from t_ids where k = 'q1'))).number, 'SIM-D-' || extract(year from public.paris_today()) || '-0001', 'numéro de devis simulation');
select pg_temp.expect_error(format($$update public.quote_lines set quantity = 99 where quote_id = %L$$, (select id from t_ids where k = 'q1')), '%plus modifiables%');
select pg_temp.expect_error(format($$update public.quotes set title = 'x' where id = %L$$, (select id from t_ids where k = 'q1')), '%nouvelle version%');
select pg_temp.expect_error(format($$delete from public.quotes where id = %L$$, (select id from t_ids where k = 'q1')), '%ne peut pas être supprimé%');
select pg_temp.eq((select snapshot -> 'seller' ->> 'trade_name' from public.quotes where id = (select id from t_ids where k = 'q1')), 'AF Nettoyage', 'instantané vendeur');

-- Nouvelle version
insert into t_ids values ('q1v2', public.copy_quote((select id from t_ids where k = 'q1'), true));
select pg_temp.eq((public.issue_quote((select id from t_ids where k = 'q1v2'))).number, 'SIM-D-' || extract(year from public.paris_today()) || '-0001-V2', 'numéro de version');
select pg_temp.eq((select status from public.quotes where id = (select id from t_ids where k = 'q1')), 'remplace', 'ancienne version remplacée');

-- Acceptation puis facture
update public.quotes set status = 'accepte' where id = (select id from t_ids where k = 'q1v2');
select pg_temp.expect_error(format($$update public.quotes set status = 'brouillon' where id = %L$$, (select id from t_ids where k = 'q1v2')), '%Transition%');
insert into t_ids values ('f1', public.invoice_from_quote((select id from t_ids where k = 'q1v2')));
select pg_temp.eq((select total_ttc_cents from public.invoices where id = (select id from t_ids where k = 'f1')),
                  (select total_ttc_cents from public.quotes where id = (select id from t_ids where k = 'q1v2')), 'facture = devis');
select pg_temp.expect_error(format($$update public.invoices set status = 'emise' where id = %L$$, (select id from t_ids where k = 'f1')), '%Émettre la facture%');
select pg_temp.expect_error(format($$insert into public.payments (invoice_id, amount_cents) values (%L, 100)$$, (select id from t_ids where k = 'f1')), '%facture émise%');

select pg_temp.eq((public.issue_invoice((select id from t_ids where k = 'f1'))).number, 'SIM-F-' || extract(year from public.paris_today()) || '-0001', 'numéro de facture');
select pg_temp.expect_error(format($$update public.invoices set notes = 'x' where id = %L$$, (select id from t_ids where k = 'f1')), '%avoir%');
select pg_temp.expect_error(format($$delete from public.invoices where id = %L$$, (select id from t_ids where k = 'f1')), '%avoir%');
select pg_temp.expect_error(format($$delete from public.invoice_lines where invoice_id = %L$$, (select id from t_ids where k = 'f1')), '%plus modifiables%');
-- Le statut est dérivé, pas saisi
update public.invoices set status = 'payee' where id = (select id from t_ids where k = 'f1');
select pg_temp.eq((select status from public.invoices where id = (select id from t_ids where k = 'f1')), 'emise', 'statut non forçable');

-- Paiements partiels (TTC = 7110 + 20 % = 8532)
insert into public.payments (invoice_id, amount_cents) select id, 3000 from t_ids where k = 'f1';
select pg_temp.eq((select status || ':' || paid_cents from public.invoices where id = (select id from t_ids where k = 'f1')), 'partiellement_payee:3000', 'paiement partiel');
select pg_temp.expect_error(format($$insert into public.payments (invoice_id, amount_cents) values (%L, 999999)$$, (select id from t_ids where k = 'f1')), '%reste à payer%');
insert into public.payments (invoice_id, amount_cents) select id, 5532 from t_ids where k = 'f1';
select pg_temp.eq((select status from public.invoices where id = (select id from t_ids where k = 'f1')), 'payee', 'facture soldée');
delete from public.payments where invoice_id = (select id from t_ids where k = 'f1') and amount_cents = 5532;
select pg_temp.eq((select status from public.invoices where id = (select id from t_ids where k = 'f1')), 'partiellement_payee', 'suppression d''un règlement');

-- Avoir total sur une facture avec minimum appliqué
insert into t_ids values ('f2', public.new_invoice('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'));
insert into public.invoice_lines (invoice_id, position, kind, label, quantity, unit, unit_price_cents)
select id, 1, 'service', 'Sanitaires', 0.5, 'heure', 3000 from t_ids where k = 'f2';
select pg_temp.eq((select total_ht_cents from public.invoices where id = (select id from t_ids where k = 'f2')), 5000::bigint, 'facture minimum + déplacement');
select public.issue_invoice((select id from t_ids where k = 'f2'));
insert into t_ids values ('av1', public.credit_note_for((select id from t_ids where k = 'f2')));
select pg_temp.eq((select total_ttc_cents from public.invoices where id = (select id from t_ids where k = 'av1')),
                  (select total_ttc_cents from public.invoices where id = (select id from t_ids where k = 'f2')), 'avoir total = facture');
select pg_temp.eq((public.issue_invoice((select id from t_ids where k = 'av1'))).number, 'SIM-AV-' || extract(year from public.paris_today()) || '-0001', 'numéro d''avoir');
select pg_temp.eq((select status from public.invoices where id = (select id from t_ids where k = 'f2')), 'annulee', 'facture annulée par avoir');
select pg_temp.expect_error(format($$select public.credit_note_for(%L)$$, (select id from t_ids where k = 'f2')), '%intégralement%');

-- Mode exploitation : refus tant que les informations légales manquent ; changement direct interdit
select pg_temp.expect_error($$select public.set_operating_mode('exploitation')$$, '%incomplètes%SIREN%');
select pg_temp.expect_error($$update public.company_settings set mode = 'exploitation' where id = 1$$, '%action dédiée%');
update public.company_settings set legal_name = 'Adel Ferchichi', legal_form = 'EI', siren = '123456789', siret = '12345678900012',
  address_line1 = '1 rue Exemple', postal_code = '31400', city = 'Toulouse', vat_regime = 'franchise', iban = 'FR7600000000000000000000000',
  email = 'contact@example.test' where id = 1;
select public.set_operating_mode('exploitation');
insert into t_ids values ('f3', public.new_invoice('10000000-0000-0000-0000-000000000001', null));
insert into public.invoice_lines (invoice_id, position, kind, label, quantity, unit, unit_price_cents)
select id, 1, 'service', 'Vitres', 20, 'm2', 300 from t_ids where k = 'f3';
do $$
declare f public.invoices;
begin
  f := public.issue_invoice((select id from t_ids where k = 'f3'));
  perform pg_temp.eq(f.number, 'F-' || extract(year from public.paris_today()) || '-0001', 'première facture réelle');
  perform pg_temp.eq(f.is_simulation, false, 'facture réelle');
  perform pg_temp.eq(f.total_vat_cents, 0::bigint, 'franchise : pas de TVA');
  perform pg_temp.eq(f.total_ttc_cents, 6000::bigint, 'franchise : TTC = HT');
end $$;
select pg_temp.expect_error($$select public.set_operating_mode('preparation')$$, '%retour au mode préparation impossible%');
select pg_temp.expect_error($$update public.company_settings set siret = '' where id = 1$$, '%ne peuvent pas être effacées%');

-- Récurrence : deux fois par mois
insert into public.recurrences (id, client_id, rule, start_date, title)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'deux_fois_par_mois', public.paris_today(), 'Vitrine');
select pg_temp.eq(public.generate_recurrence('30000000-0000-0000-0000-000000000001', public.paris_today() + 59) between 3 and 5, true, 'occurrences générées');
select pg_temp.eq(public.generate_recurrence('30000000-0000-0000-0000-000000000001', public.paris_today() + 59), 0, 'génération idempotente');

-- Demande publique → client → diagnostic → devis
reset role;
insert into public.requests (customer_type, first_name, last_name, email, address_line1, postal_code, city, lat, lng, category_slugs, surface_m2)
values ('particulier', 'Paul', 'Martin', 'paul@example.test', '2 rue de Metz', '31000', 'Toulouse', 43.6006, 1.4442, '{vitrerie-particuliers}', 12);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into t_ids values ('d1', public.diagnostic_from_request((select id from public.requests where email = 'paul@example.test')));
select pg_temp.eq((select count(*) from public.diagnostic_items where diagnostic_id = (select id from t_ids where k = 'd1')), 1::bigint, 'ligne de diagnostic préremplie');
insert into t_ids values ('q2', public.new_quote(null, null, null, (select id from t_ids where k = 'd1')));
select pg_temp.eq((select services_gross_cents from public.quotes where id = (select id from t_ids where k = 'q2')), 3600::bigint, 'devis depuis diagnostic (12 m² × 3 €)');
select pg_temp.eq((select travel_billed_cents from public.quotes where id = (select id from t_ids where k = 'q2')), 500::bigint, 'déplacement centre-ville');

-- Journal
select pg_temp.eq((select count(*) > 10 from public.audit_log), true, 'journal alimenté');
select pg_temp.eq((select actor_email from public.audit_log where table_name = 'invoices' and action = 'update' limit 1), 'adel@example.test', 'auteur tracé');
select pg_temp.expect_error($$delete from public.audit_log$$, '%permission denied%');
reset role;

\echo 'Tous les tests SQL sont passés.'

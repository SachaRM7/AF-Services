-- AF Nettoyage — schéma principal
-- Conventions :
--   * montants en centimes (bigint), jamais en flottants ;
--   * quantités en numeric(12,3) ;
--   * pourcentages en points de base (1 % = 100 bp) ;
--   * les documents émis (devis envoyés, factures émises) conservent un instantané (snapshot jsonb).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Administrateurs
-- ---------------------------------------------------------------------------

create table public.admin_allowlist (
  email text primary key check (email = lower(email)),
  full_name text not null default '',
  created_at timestamptz not null default now()
);
comment on table public.admin_allowlist is
  'Adresses autorisées à devenir administrateur. Un compte Auth créé avec une de ces adresses reçoit automatiquement un profil admin.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select full_name into v_name from public.admin_allowlist where email = lower(new.email);
  if found then
    insert into public.profiles (id, email, full_name)
    values (new.id, lower(new.email), coalesce(v_name, ''))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Paramètres de l'entreprise (ligne unique)
-- ---------------------------------------------------------------------------

create table public.company_settings (
  id smallint primary key default 1 check (id = 1),
  -- identité commerciale
  trade_name text not null default 'AF Nettoyage',
  tagline text not null default 'Vitrerie & Entretien',
  founder_name text not null default 'Adel Ferchichi',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  -- identité légale
  legal_name text not null default '',
  legal_form text not null default '',            -- ex. "EI", "EURL", "SASU", "Micro-entreprise (EI)"
  siren text not null default '' check (siren = '' or siren ~ '^[0-9]{9}$'),
  siret text not null default '' check (siret = '' or siret ~ '^[0-9]{14}$'),
  registration text not null default '',          -- RCS / RNE / RM
  ape_code text not null default '',
  share_capital text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  postal_code text not null default '',
  city text not null default 'Toulouse',
  -- TVA
  vat_regime text not null default 'a_definir' check (vat_regime in ('a_definir', 'franchise', 'assujetti')),
  vat_number text not null default '',
  default_vat_rate_bps integer not null default 2000 check (default_vat_rate_bps between 0 and 10000),
  vat_on_debits boolean not null default false,
  franchise_mention text not null default 'TVA non applicable, art. 293 B du CGI',
  -- banque & paiement
  bank_name text not null default '',
  iban text not null default '',
  bic text not null default '',
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 60),
  payment_methods text not null default 'Virement bancaire, chèque ou espèces dans la limite légale',
  late_penalty_text text not null default 'En cas de retard de paiement, pénalités au taux d''intérêt de la BCE majoré de 10 points (art. L441-10 du Code de commerce).',
  recovery_fee_text text not null default 'Indemnité forfaitaire pour frais de recouvrement due aux clients professionnels : 40 € (art. D441-5 du Code de commerce).',
  early_payment_text text not null default 'Pas d''escompte pour paiement anticipé.',
  insurance_text text not null default '',
  -- documents
  quote_validity_days integer not null default 30 check (quote_validity_days between 1 and 365),
  quote_conditions text not null default 'Devis établi sur la base des informations communiquées et/ou du diagnostic réalisé sur place. Toute modification du périmètre (surface, état, accès) pourra donner lieu à un avenant. Bon pour accord : date, signature et mention « Devis reçu avant l''exécution des travaux ».',
  invoice_footer text not null default '',
  -- tarification
  minimum_charge_cents bigint not null default 4000 check (minimum_charge_cents >= 0),
  -- déplacement
  base_label text not null default 'Empalot, Toulouse',
  base_lat numeric(9,6) not null default 43.580200,
  base_lng numeric(9,6) not null default 1.444300,
  distance_method text not null default 'vol_oiseau' check (distance_method in ('vol_oiseau')),
  manual_review_km numeric(6,2) not null default 25,
  -- mode
  mode text not null default 'preparation' check (mode in ('preparation', 'exploitation')),
  exploitation_since timestamptz,
  -- facturation électronique (préparation réforme 2026-2027)
  einvoicing_platform text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.company_settings (id) values (1);

create table public.travel_bands (
  id uuid primary key default gen_random_uuid(),
  max_km numeric(6,2) check (max_km is null or max_km > 0),   -- null = au-delà de toutes les autres tranches
  fee_cents bigint not null check (fee_cents >= 0),
  label text not null default '',
  created_at timestamptz not null default now()
);
create unique index travel_bands_single_open on public.travel_bands ((max_km is null)) where max_km is null;

insert into public.travel_bands (max_km, fee_cents, label) values
  (5, 500, 'Zone 1 — jusqu''à 5 km'),
  (10, 1000, 'Zone 2 — de 5 à 10 km'),
  (15, 1500, 'Zone 3 — de 10 à 15 km'),
  (null, 2000, 'Zone 4 — au-delà de 15 km');

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  audience text not null default 'tous' check (audience in ('particuliers', 'professionnels', 'tous')),
  summary text not null default '',
  form_kind text not null default 'generique' check (form_kind in ('vitrerie', 'surfaces', 'sanitaires', 'generique')),
  is_public boolean not null default true,
  sort_order integer not null default 0
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id),
  name text not null,
  description text not null default '',
  unit text not null check (unit in ('m2', 'heure', 'unite', 'forfait')),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  active boolean not null default true,
  requires_special_equipment boolean not null default false,
  constraints_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clients et chantiers
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('particulier', 'professionnel')),
  first_name text not null default '',
  last_name text not null default '',
  company_name text not null default '',
  siren text not null default '',
  vat_number text not null default '',
  email text not null default '',
  phone text not null default '',
  billing_address_line1 text not null default '',
  billing_address_line2 text not null default '',
  billing_postal_code text not null default '',
  billing_city text not null default '',
  notes text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text generated always as (
    case when kind = 'professionnel' and company_name <> '' then company_name
         else trim(first_name || ' ' || last_name) end
  ) stored
);
create index clients_display_name_idx on public.clients (lower(display_name));

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  label text not null default '',
  address_line1 text not null,
  address_line2 text not null default '',
  postal_code text not null default '',
  city text not null default '',
  lat numeric(9,6),
  lng numeric(9,6),
  distance_km numeric(6,2),
  access_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sites_client_idx on public.sites (client_id);

-- ---------------------------------------------------------------------------
-- Demandes entrantes
-- ---------------------------------------------------------------------------

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'devis' check (kind in ('devis', 'contact')),
  status text not null default 'nouvelle' check (status in
    ('nouvelle', 'a_qualifier', 'diagnostic_necessaire', 'devis_envoye', 'acceptee', 'refusee', 'cloturee')),
  customer_type text not null default 'particulier' check (customer_type in ('particulier', 'professionnel')),
  first_name text not null default '',
  last_name text not null default '',
  company_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address_line1 text not null default '',
  postal_code text not null default '',
  city text not null default '',
  lat numeric(9,6),
  lng numeric(9,6),
  distance_km numeric(6,2),
  travel_fee_cents bigint,
  category_slugs text[] not null default '{}',
  surface_m2 numeric(10,2),
  quantity text not null default '',
  frequency text not null default '',
  access_info text not null default '',
  preferred_dates text not null default '',
  message text not null default '',
  consent_at timestamptz,
  ip_hash text,
  client_id uuid references public.clients (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_status_idx on public.requests (status, created_at desc);
create index requests_ip_idx on public.requests (ip_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Diagnostics de chantier
-- ---------------------------------------------------------------------------

create table public.diagnostics (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'brouillon' check (status in ('brouillon', 'finalise')),
  client_id uuid references public.clients (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  request_id uuid references public.requests (id) on delete set null,
  visit_date date,
  frequency text not null default 'ponctuelle',
  general_state text not null default '',
  dirt_level smallint check (dirt_level between 1 and 4),
  accessibility text not null default '',
  difficulties text not null default '',
  equipment_needed text not null default '',
  parking_access text not null default '',
  observations text not null default '',
  material_cost_cents bigint not null default 0 check (material_cost_cents >= 0),
  proposed_price_cents bigint,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diagnostic_items (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id uuid not null references public.diagnostics (id) on delete cascade,
  position integer not null default 0,
  service_id uuid references public.services (id) on delete set null,
  label text not null default '',
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  unit text not null default 'heure' check (unit in ('m2', 'heure', 'unite', 'forfait')),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  specifics jsonb not null default '{}'::jsonb,
  notes text not null default ''
);
create index diagnostic_items_diag_idx on public.diagnostic_items (diagnostic_id);

-- ---------------------------------------------------------------------------
-- Séquences de numérotation (chronologiques, sans trou)
-- ---------------------------------------------------------------------------

create table public.document_sequences (
  doc_type text not null check (doc_type in ('devis', 'facture', 'avoir')),
  year integer not null,
  simulation boolean not null,
  last_value integer not null default 0,
  primary key (doc_type, year, simulation)
);

-- ---------------------------------------------------------------------------
-- Devis
-- ---------------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  root_id uuid references public.quotes (id) on delete restrict,
  version integer not null default 1,
  status text not null default 'brouillon' check (status in
    ('brouillon', 'envoye', 'accepte', 'refuse', 'expire', 'remplace', 'annule')),
  is_simulation boolean not null default true,
  client_id uuid references public.clients (id) on delete restrict,
  site_id uuid references public.sites (id) on delete set null,
  request_id uuid references public.requests (id) on delete set null,
  diagnostic_id uuid references public.diagnostics (id) on delete set null,
  title text not null default '',
  issue_date date,
  valid_until date,
  conditions text not null default '',
  notes text not null default '',
  -- paramètres de calcul
  vat_rate_bps integer not null default 2000 check (vat_rate_bps between 0 and 10000),
  vat_exempt boolean not null default false,
  apply_minimum boolean not null default true,
  minimum_cents bigint not null default 4000 check (minimum_cents >= 0),
  travel_distance_km numeric(6,2),
  travel_fee_cents bigint not null default 0 check (travel_fee_cents >= 0),
  travel_fee_override_cents bigint check (travel_fee_override_cents >= 0),
  travel_override_reason text not null default '',
  -- totaux (calculés par la base)
  services_gross_cents bigint not null default 0,
  adjustments_cents bigint not null default 0,
  minimum_adjustment_cents bigint not null default 0,
  travel_billed_cents bigint not null default 0,
  total_ht_cents bigint not null default 0,
  total_vat_cents bigint not null default 0,
  total_ttc_cents bigint not null default 0,
  -- récurrence proposée
  recurrence_text text not null default '',
  snapshot jsonb,
  pdf_path text,
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_status_idx on public.quotes (status, created_at desc);
create index quotes_client_idx on public.quotes (client_id);

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position integer not null default 0,
  kind text not null default 'service' check (kind in ('service', 'adjustment', 'note')),
  service_id uuid references public.services (id) on delete set null,
  label text not null default '',
  description text not null default '',
  quantity numeric(12,3) not null default 1 check (quantity >= 0),
  unit text not null default 'unite' check (unit in ('m2', 'heure', 'unite', 'forfait')),
  unit_price_cents bigint not null default 0,
  discount_bps integer not null default 0 check (discount_bps between 0 and 10000),
  percent_bps integer check (percent_bps between -10000 and 10000),
  total_ht_cents bigint not null default 0,
  check (kind <> 'service' or unit_price_cents >= 0)
);
create index quote_lines_quote_idx on public.quote_lines (quote_id, position);

-- ---------------------------------------------------------------------------
-- Factures et avoirs
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  kind text not null default 'facture' check (kind in ('facture', 'avoir')),
  credited_invoice_id uuid references public.invoices (id) on delete restrict,
  status text not null default 'brouillon' check (status in
    ('brouillon', 'emise', 'partiellement_payee', 'payee', 'annulee')),
  is_simulation boolean not null default true,
  client_id uuid references public.clients (id) on delete restrict,
  site_id uuid references public.sites (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  title text not null default '',
  issue_date date,
  service_date date,
  service_period_end date,
  due_date date,
  notes text not null default '',
  vat_rate_bps integer not null default 2000 check (vat_rate_bps between 0 and 10000),
  vat_exempt boolean not null default false,
  apply_minimum boolean not null default true,
  minimum_cents bigint not null default 4000 check (minimum_cents >= 0),
  travel_distance_km numeric(6,2),
  travel_fee_cents bigint not null default 0 check (travel_fee_cents >= 0),
  travel_fee_override_cents bigint check (travel_fee_override_cents >= 0),
  travel_override_reason text not null default '',
  services_gross_cents bigint not null default 0,
  adjustments_cents bigint not null default 0,
  minimum_adjustment_cents bigint not null default 0,
  travel_billed_cents bigint not null default 0,
  total_ht_cents bigint not null default 0,
  total_vat_cents bigint not null default 0,
  total_ttc_cents bigint not null default 0,
  paid_cents bigint not null default 0,
  credited_cents bigint not null default 0,
  operation_category text not null default 'prestation_services'
    check (operation_category in ('prestation_services', 'livraison_biens', 'mixte')),
  einvoice_status text not null default 'non_transmise'
    check (einvoice_status in ('non_transmise', 'transmise', 'deposee', 'rejetee', 'encaissee')),
  einvoice_reference text not null default '',
  snapshot jsonb,
  pdf_path text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'facture' or credited_invoice_id is not null)
);
create index invoices_status_idx on public.invoices (status, issue_date desc);
create index invoices_client_idx on public.invoices (client_id);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position integer not null default 0,
  kind text not null default 'service' check (kind in ('service', 'adjustment', 'note')),
  service_id uuid references public.services (id) on delete set null,
  label text not null default '',
  description text not null default '',
  quantity numeric(12,3) not null default 1 check (quantity >= 0),
  unit text not null default 'unite' check (unit in ('m2', 'heure', 'unite', 'forfait')),
  unit_price_cents bigint not null default 0,
  discount_bps integer not null default 0 check (discount_bps between 0 and 10000),
  percent_bps integer check (percent_bps between -10000 and 10000),
  total_ht_cents bigint not null default 0,
  check (kind <> 'service' or unit_price_cents >= 0)
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  paid_on date not null default current_date,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null default 'virement' check (method in ('virement', 'cheque', 'especes', 'carte', 'autre')),
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);

-- ---------------------------------------------------------------------------
-- Interventions et récurrences
-- ---------------------------------------------------------------------------

create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  title text not null default '',
  rule text not null check (rule in ('hebdomadaire', 'bimensuelle', 'deux_fois_par_mois', 'mensuelle')),
  start_date date not null,
  end_date date,
  start_time time not null default '09:00',
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  assignee text not null default '',
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  diagnostic_id uuid references public.diagnostics (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  recurrence_id uuid references public.recurrences (id) on delete set null,
  title text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  assignee text not null default '',
  status text not null default 'planifiee' check (status in ('planifiee', 'en_cours', 'terminee', 'annulee')),
  planned_services text not null default '',
  estimated_minutes integer check (estimated_minutes >= 0),
  actual_minutes integer check (actual_minutes >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index interventions_starts_idx on public.interventions (starts_at);
create unique index interventions_recurrence_slot on public.interventions (recurrence_id, starts_at) where recurrence_id is not null;

-- ---------------------------------------------------------------------------
-- Dépenses (suivi interne, ne remplace pas la comptabilité)
-- ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  category text not null check (category in ('materiel', 'produits', 'carburant', 'vehicule', 'assurance', 'autre')),
  label text not null,
  amount_ht_cents bigint not null check (amount_ht_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  intervention_id uuid references public.interventions (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pièces jointes (photos, documents)
-- ---------------------------------------------------------------------------

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'chantiers',
  storage_path text not null unique,
  file_name text not null default '',
  mime_type text not null default '',
  size_bytes bigint,
  phase text not null default 'avant' check (phase in ('avant', 'apres', 'autre')),
  request_id uuid references public.requests (id) on delete cascade,
  diagnostic_id uuid references public.diagnostics (id) on delete cascade,
  intervention_id uuid references public.interventions (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Journal des actions
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  table_name text not null,
  record_id text,
  summary text not null default '',
  changes jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

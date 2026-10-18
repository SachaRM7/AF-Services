import type { LineKind, Unit } from "./pricing";

export type ClientKind = "particulier" | "professionnel";

export interface CompanySettings {
  id: 1;
  trade_name: string; tagline: string; founder_name: string; phone: string; email: string; website: string;
  legal_name: string; legal_form: string; siren: string; siret: string; registration: string; ape_code: string;
  share_capital: string; address_line1: string; address_line2: string; postal_code: string; city: string;
  vat_regime: "a_definir" | "franchise" | "assujetti"; vat_number: string; default_vat_rate_bps: number;
  vat_on_debits: boolean; franchise_mention: string;
  bank_name: string; iban: string; bic: string; payment_terms_days: number; payment_methods: string;
  late_penalty_text: string; recovery_fee_text: string; early_payment_text: string; insurance_text: string;
  quote_validity_days: number; quote_conditions: string; invoice_footer: string;
  minimum_charge_cents: number;
  base_label: string; base_lat: number; base_lng: number; distance_method: "vol_oiseau"; manual_review_km: number;
  mode: "preparation" | "exploitation"; exploitation_since: string | null; einvoicing_platform: string;
}

export interface TravelBandRow { id: string; max_km: number | null; fee_cents: number; label: string }

export interface ServiceCategory {
  id: string; slug: string; name: string; audience: "particuliers" | "professionnels" | "tous";
  summary: string; form_kind: "vitrerie" | "surfaces" | "sanitaires" | "generique"; is_public: boolean; sort_order: number;
}

export interface Service {
  id: string; category_id: string; name: string; description: string; unit: Unit; unit_price_cents: number;
  active: boolean; requires_special_equipment: boolean; constraints_text: string; sort_order: number;
}

export interface Client {
  id: string; kind: ClientKind; first_name: string; last_name: string; company_name: string; siren: string;
  vat_number: string; email: string; phone: string; billing_address_line1: string; billing_address_line2: string;
  billing_postal_code: string; billing_city: string; notes: string; archived: boolean; display_name: string;
  created_at: string;
}

export interface Site {
  id: string; client_id: string; label: string; address_line1: string; address_line2: string; postal_code: string;
  city: string; lat: number | null; lng: number | null; distance_km: number | null; access_notes: string;
}

export type RequestStatus =
  | "nouvelle" | "a_qualifier" | "diagnostic_necessaire" | "devis_envoye" | "acceptee" | "refusee" | "cloturee";

export interface RequestRow {
  id: string; kind: "devis" | "contact"; status: RequestStatus; customer_type: ClientKind;
  first_name: string; last_name: string; company_name: string; email: string; phone: string;
  address_line1: string; postal_code: string; city: string; lat: number | null; lng: number | null;
  distance_km: number | null; travel_fee_cents: number | null; category_slugs: string[]; surface_m2: number | null;
  quantity: string; frequency: string; access_info: string; preferred_dates: string; message: string;
  client_id: string | null; site_id: string | null; internal_notes: string; created_at: string;
}

export interface Diagnostic {
  id: string; status: "brouillon" | "finalise"; client_id: string | null; site_id: string | null; request_id: string | null;
  visit_date: string | null; frequency: string; general_state: string; dirt_level: number | null; accessibility: string;
  difficulties: string; equipment_needed: string; parking_access: string; observations: string;
  material_cost_cents: number; proposed_price_cents: number | null; created_at: string; updated_at: string;
}

export interface DiagnosticItem {
  id: string; diagnostic_id: string; position: number; service_id: string | null; label: string; quantity: number;
  unit: Unit; unit_price_cents: number; estimated_minutes: number; specifics: Record<string, string | number | boolean>;
  notes: string;
}

export interface DocLine {
  id: string; position: number; kind: LineKind; service_id: string | null; label: string; description: string;
  quantity: number; unit: Unit; unit_price_cents: number; discount_bps: number; percent_bps: number | null;
  total_ht_cents: number;
}

interface DocTotals {
  vat_rate_bps: number; vat_exempt: boolean; apply_minimum: boolean; minimum_cents: number;
  travel_distance_km: number | null; travel_fee_cents: number; travel_fee_override_cents: number | null;
  travel_override_reason: string; services_gross_cents: number; adjustments_cents: number;
  minimum_adjustment_cents: number; travel_billed_cents: number; total_ht_cents: number; total_vat_cents: number;
  total_ttc_cents: number;
}

export type QuoteStatus = "brouillon" | "envoye" | "accepte" | "refuse" | "expire" | "remplace" | "annule";

export interface Quote extends DocTotals {
  id: string; number: string | null; root_id: string | null; version: number; status: QuoteStatus;
  is_simulation: boolean; client_id: string | null; site_id: string | null; request_id: string | null;
  diagnostic_id: string | null; title: string; issue_date: string | null; valid_until: string | null;
  conditions: string; notes: string; recurrence_text: string; snapshot: DocSnapshot | null; pdf_path: string | null;
  sent_at: string | null; decided_at: string | null; created_at: string; updated_at: string;
}

export type InvoiceStatus = "brouillon" | "emise" | "partiellement_payee" | "payee" | "annulee";

export interface Invoice extends DocTotals {
  id: string; number: string | null; kind: "facture" | "avoir"; credited_invoice_id: string | null;
  status: InvoiceStatus; is_simulation: boolean; client_id: string | null; site_id: string | null;
  quote_id: string | null; title: string; issue_date: string | null; service_date: string | null;
  service_period_end: string | null; due_date: string | null; notes: string; paid_cents: number;
  credited_cents: number; operation_category: string; einvoice_status: string; einvoice_reference: string;
  snapshot: DocSnapshot | null; pdf_path: string | null; issued_at: string | null; created_at: string;
}

export interface DocSnapshot {
  seller: Partial<CompanySettings>;
  client: Partial<Client> | null;
  site: Partial<Site> | null;
  document: Record<string, unknown>;
  lines: DocLine[];
  frozen_at: string;
}

export interface Payment {
  id: string; invoice_id: string; paid_on: string; amount_cents: number;
  method: "virement" | "cheque" | "especes" | "carte" | "autre"; reference: string; notes: string;
}

export interface Intervention {
  id: string; client_id: string | null; site_id: string | null; quote_id: string | null; diagnostic_id: string | null;
  invoice_id: string | null; recurrence_id: string | null; title: string; starts_at: string; ends_at: string | null;
  assignee: string; status: "planifiee" | "en_cours" | "terminee" | "annulee"; planned_services: string;
  estimated_minutes: number | null; actual_minutes: number | null; notes: string;
}

export interface Recurrence {
  id: string; client_id: string; site_id: string | null; quote_id: string | null; title: string;
  rule: "hebdomadaire" | "bimensuelle" | "deux_fois_par_mois" | "mensuelle"; start_date: string;
  end_date: string | null; start_time: string; duration_minutes: number; assignee: string; active: boolean; notes: string;
}

export interface Expense {
  id: string; spent_on: string; category: "materiel" | "produits" | "carburant" | "vehicule" | "assurance" | "autre";
  label: string; amount_ht_cents: number; vat_cents: number; intervention_id: string | null; notes: string;
}

export interface Attachment {
  id: string; bucket: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number | null;
  phase: "avant" | "apres" | "autre"; request_id: string | null; diagnostic_id: string | null;
  intervention_id: string | null; client_id: string | null; created_at: string;
}

export interface AuditEntry {
  id: number; at: string; actor_email: string | null; action: string; table_name: string; record_id: string | null;
  summary: string; changes: Record<string, unknown> | null;
}

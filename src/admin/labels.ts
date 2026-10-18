import type { InvoiceStatus, QuoteStatus, RequestStatus } from "../lib/types";

type Tone = "neutral" | "dark" | "info" | "ok" | "warn" | "bad" | "muted";

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-stone/70 bg-white text-ink",
  dark: "border-ink bg-ink text-paper",
  info: "border-sky-900/20 bg-sky-50 text-sky-950",
  ok: "border-emerald-900/20 bg-emerald-50 text-emerald-900",
  warn: "border-amber-900/25 bg-amber-50 text-amber-900",
  bad: "border-red-900/25 bg-red-50 text-red-900",
  muted: "border-stone/40 bg-paper text-ink-muted",
};

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: Tone }> = {
  nouvelle: { label: "Nouvelle", tone: "dark" },
  a_qualifier: { label: "À qualifier", tone: "warn" },
  diagnostic_necessaire: { label: "Diagnostic nécessaire", tone: "info" },
  devis_envoye: { label: "Devis envoyé", tone: "neutral" },
  acceptee: { label: "Acceptée", tone: "ok" },
  refusee: { label: "Refusée", tone: "bad" },
  cloturee: { label: "Clôturée", tone: "muted" },
};

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: Tone }> = {
  brouillon: { label: "Brouillon", tone: "warn" },
  envoye: { label: "Envoyé", tone: "info" },
  accepte: { label: "Accepté", tone: "ok" },
  refuse: { label: "Refusé", tone: "bad" },
  expire: { label: "Expiré", tone: "muted" },
  remplace: { label: "Remplacé", tone: "muted" },
  annule: { label: "Annulé", tone: "muted" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  brouillon: { label: "Brouillon", tone: "warn" },
  emise: { label: "Émise — impayée", tone: "info" },
  partiellement_payee: { label: "Partiellement payée", tone: "warn" },
  payee: { label: "Payée", tone: "ok" },
  annulee: { label: "Annulée par avoir", tone: "muted" },
};

export const INTERVENTION_STATUS = {
  planifiee: { label: "Planifiée", tone: "info" as Tone },
  en_cours: { label: "En cours", tone: "warn" as Tone },
  terminee: { label: "Terminée", tone: "ok" as Tone },
  annulee: { label: "Annulée", tone: "muted" as Tone },
};

export const PAYMENT_METHODS = {
  virement: "Virement",
  cheque: "Chèque",
  especes: "Espèces",
  carte: "Carte",
  autre: "Autre",
};

export const EXPENSE_CATEGORIES = {
  materiel: "Matériel",
  produits: "Produits",
  carburant: "Carburant",
  vehicule: "Véhicule (entretien)",
  assurance: "Assurance",
  autre: "Autre",
};

export const RECURRENCE_RULES = {
  hebdomadaire: "Chaque semaine",
  bimensuelle: "Toutes les deux semaines",
  deux_fois_par_mois: "Deux fois par mois",
  mensuelle: "Chaque mois",
};

export const VAT_REGIMES = {
  a_definir: "À définir",
  franchise: "Franchise en base (art. 293 B du CGI)",
  assujetti: "Assujetti à la TVA",
};

export type { Tone };

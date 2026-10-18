import type { Client, CompanySettings, DocLine, Invoice, Quote, Site } from "../lib/types";

export type DocType = "devis" | "facture" | "avoir";

/** Vue normalisée d'un document à imprimer, construite depuis l'instantané (document émis) ou les données courantes (brouillon). */
export interface DocView {
  type: DocType;
  number: string | null;
  draft: boolean;
  simulation: boolean;
  issueDate: string | null;
  validUntil?: string | null;
  serviceDate?: string | null;
  servicePeriodEnd?: string | null;
  dueDate?: string | null;
  title: string;
  seller: Partial<CompanySettings>;
  client: Partial<Client> | null;
  site: Partial<Site> | null;
  lines: DocLine[];
  vatExempt: boolean;
  vatRateBps: number;
  travelKm: number | null;
  travelOverrideReason: string;
  totals: {
    servicesGross: number;
    adjustments: number;
    minimumAdjustment: number;
    minimum: number;
    travel: number;
    ht: number;
    vat: number;
    ttc: number;
    paid?: number;
    credited?: number;
  };
  conditions?: string;
  notes: string;
  recurrenceText?: string;
  creditedNumber?: string | null;
}

type AnyDoc = (Quote | Invoice) & Record<string, unknown>;

export function buildDocView(
  kind: "quote" | "invoice",
  doc: Quote | Invoice,
  live: { seller: CompanySettings | null; client: Client | null; site: Site | null; lines: DocLine[]; creditedNumber?: string | null },
): DocView {
  const snap = doc.snapshot;
  const d = (snap?.document ?? doc) as AnyDoc;
  const n = (v: unknown) => Number(v ?? 0);
  const type: DocType = kind === "quote" ? "devis" : (d.kind as string) === "avoir" ? "avoir" : "facture";
  const isQuote = kind === "quote";
  return {
    type,
    number: (doc.number as string | null) ?? null,
    draft: doc.status === "brouillon",
    simulation: Boolean(snap ? d.is_simulation : live.seller?.mode !== "exploitation"),
    issueDate: (d.issue_date as string | null) ?? null,
    validUntil: isQuote ? ((d.valid_until as string | null) ?? null) : undefined,
    serviceDate: !isQuote ? ((d.service_date as string | null) ?? null) : undefined,
    servicePeriodEnd: !isQuote ? ((d.service_period_end as string | null) ?? null) : undefined,
    dueDate: !isQuote ? ((d.due_date as string | null) ?? null) : undefined,
    title: (d.title as string) ?? "",
    seller: snap?.seller ?? live.seller ?? {},
    client: snap?.client ?? live.client,
    site: snap?.site ?? live.site,
    lines: (snap?.lines ?? live.lines).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price_cents: n(l.unit_price_cents), total_ht_cents: n(l.total_ht_cents) })),
    vatExempt: Boolean(d.vat_exempt),
    vatRateBps: n(d.vat_rate_bps),
    travelKm: d.travel_distance_km == null ? null : Number(d.travel_distance_km),
    travelOverrideReason: (d.travel_override_reason as string) ?? "",
    totals: {
      servicesGross: n(d.services_gross_cents),
      adjustments: n(d.adjustments_cents),
      minimumAdjustment: n(d.minimum_adjustment_cents),
      minimum: n(d.minimum_cents),
      travel: n(d.travel_billed_cents),
      ht: n(d.total_ht_cents),
      vat: n(d.total_vat_cents),
      ttc: n(d.total_ttc_cents),
      paid: isQuote ? undefined : n((doc as Invoice).paid_cents),
      credited: isQuote ? undefined : n((doc as Invoice).credited_cents),
    },
    conditions: isQuote ? ((d.conditions as string) || live.seller?.quote_conditions || "") : undefined,
    notes: (d.notes as string) ?? "",
    recurrenceText: isQuote ? ((d.recurrence_text as string) ?? "") : undefined,
    creditedNumber: live.creditedNumber,
  };
}

export function pdfFileName(v: DocView): string {
  const base = v.number ?? `brouillon-${v.type}`;
  return `${base}.pdf`.replace(/[^\w.-]+/g, "_");
}

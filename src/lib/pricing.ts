// Moteur de calcul des devis et factures.
// Miroir exact de public.recalc_document (supabase/migrations/..._logic.sql) : la base reste l'autorité,
// ce module sert à l'aperçu instantané dans l'interface. Les deux sont couverts par des tests.
import { divRound, parseQuantity } from "./money";

export type Unit = "m2" | "heure" | "unite" | "forfait";
export type LineKind = "service" | "adjustment" | "note";

export interface PricingLine {
  kind: LineKind;
  quantity: string | number;
  unit_price_cents: number;
  discount_bps?: number;
  /** Ajustement en % du sous-total des prestations (négatif = remise, positif = majoration). */
  percent_bps?: number | null;
}

export interface PricingParams {
  apply_minimum: boolean;
  minimum_cents: number;
  travel_fee_cents: number;
  travel_fee_override_cents?: number | null;
  vat_rate_bps: number;
  vat_exempt: boolean;
}

export interface PricingResult {
  lineTotals: number[];
  servicesGross: number;
  adjustments: number;
  minimumAdjustment: number;
  servicesBilled: number;
  travel: number;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
}

export function serviceLineTotal(quantity: string | number, unitPriceCents: number, discountBps = 0): bigint {
  const gross = divRound(parseQuantity(quantity) * BigInt(unitPriceCents), 1000n);
  return divRound(gross * BigInt(10000 - discountBps), 10000n);
}

export function computeTotals(lines: PricingLine[], p: PricingParams): PricingResult {
  const totals: bigint[] = lines.map((l) =>
    l.kind === "service" ? serviceLineTotal(l.quantity, l.unit_price_cents, l.discount_bps ?? 0) : 0n,
  );
  const gross = lines.reduce((acc, l, i) => (l.kind === "service" ? acc + totals[i] : acc), 0n);
  const hasService = lines.some((l) => l.kind === "service");

  lines.forEach((l, i) => {
    if (l.kind !== "adjustment") return;
    totals[i] =
      l.percent_bps != null
        ? divRound(gross * BigInt(l.percent_bps), 10000n)
        : divRound(parseQuantity(l.quantity) * BigInt(l.unit_price_cents), 1000n);
  });
  const adjustments = lines.reduce((acc, l, i) => (l.kind === "adjustment" ? acc + totals[i] : acc), 0n);

  const net = gross + adjustments;
  const minimum = BigInt(p.minimum_cents);
  const minAdj = p.apply_minimum && hasService && net < minimum ? minimum - net : 0n;
  const travel = BigInt(p.travel_fee_override_cents ?? p.travel_fee_cents);
  const ht = net + minAdj + travel;
  const vat = p.vat_exempt ? 0n : divRound(ht * BigInt(p.vat_rate_bps), 10000n);

  return {
    lineTotals: totals.map(Number),
    servicesGross: Number(gross),
    adjustments: Number(adjustments),
    minimumAdjustment: Number(minAdj),
    servicesBilled: Number(net + minAdj),
    travel: Number(travel),
    totalHt: Number(ht),
    totalVat: Number(vat),
    totalTtc: Number(ht + vat),
  };
}

export const UNIT_LABELS: Record<Unit, { short: string; long: string }> = {
  m2: { short: "m²", long: "au m²" },
  heure: { short: "h", long: "à l'heure" },
  unite: { short: "u.", long: "à l'unité" },
  forfait: { short: "forfait", long: "au forfait" },
};

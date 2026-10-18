import { describe, expect, it } from "vitest";
import { computeTotals, serviceLineTotal } from "./pricing";
import { divRound, formatEuros, parseEuros, parseQuantity } from "./money";
import { DEFAULT_BANDS, haversineKm, travelFeeForKm } from "./travel";

const base = { apply_minimum: true, minimum_cents: 4000, travel_fee_cents: 1000, vat_rate_bps: 2000, vat_exempt: false };

describe("money", () => {
  it("arrondit demi loin de zéro comme PostgreSQL", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
  });
  it("parse les quantités et montants en notation française", () => {
    expect(parseQuantity("12,5")).toBe(12500n);
    expect(parseQuantity("8.333")).toBe(8333n);
    expect(parseQuantity("0.0005")).toBe(1n);
    expect(parseEuros("12,50")).toBe(1250);
    expect(parseEuros("0.1")).toBe(10);
    expect(parseEuros("-3")).toBe(-300);
    expect(() => parseEuros("abc")).toThrow();
  });
  it("évite les erreurs de flottants", () => {
    // 0,1 + 0,2 en flottant ≠ 0,3
    expect(parseEuros("0,1") + parseEuros("0,2")).toBe(parseEuros("0,3"));
    expect(Number(serviceLineTotal("3", 10))).toBe(30);
  });
  it("formate en euros", () => {
    expect(formatEuros(123456).replace(/\s/g, " ")).toBe("1 234,56 €");
  });
});

describe("computeTotals", () => {
  it("applique l'exemple du cahier des charges (25 € → 40 € + 10 € = 50 € HT)", () => {
    const r = computeTotals([{ kind: "service", quantity: "8.333", unit_price_cents: 300 }], base);
    expect(r.servicesGross).toBe(2500);
    expect(r.minimumAdjustment).toBe(1500);
    expect(r.totalHt).toBe(5000);
    expect(r.totalVat).toBe(1000);
    expect(r.totalTtc).toBe(6000);
  });

  it("applique le minimum au total des prestations, pas à chaque ligne", () => {
    const r = computeTotals(
      [
        { kind: "service", quantity: 5, unit_price_cents: 300 },
        { kind: "service", quantity: 1, unit_price_cents: 3000 },
      ],
      base,
    );
    expect(r.servicesGross).toBe(4500);
    expect(r.minimumAdjustment).toBe(0);
  });

  it("gère remises de ligne, remise globale en % et majoration fixe (identique aux tests SQL)", () => {
    const r = computeTotals(
      [
        { kind: "service", quantity: "8.333", unit_price_cents: 300 },
        { kind: "service", quantity: 2, unit_price_cents: 3000, discount_bps: 1000 },
        { kind: "adjustment", quantity: 1, unit_price_cents: 0, percent_bps: -1000 },
        { kind: "note", quantity: 0, unit_price_cents: 0 },
      ],
      base,
    );
    expect(r.lineTotals).toEqual([2500, 5400, -790, 0]);
    expect(r.totalHt).toBe(8110);
  });

  it("respecte la dérogation des frais de déplacement et la franchise de TVA", () => {
    const r = computeTotals([{ kind: "service", quantity: 20, unit_price_cents: 300 }], {
      ...base,
      travel_fee_override_cents: 0,
      vat_exempt: true,
    });
    expect(r.travel).toBe(0);
    expect(r.totalVat).toBe(0);
    expect(r.totalTtc).toBe(6000);
  });

  it("n'applique pas de minimum sans prestation", () => {
    const r = computeTotals([], base);
    expect(r.minimumAdjustment).toBe(0);
    expect(r.totalHt).toBe(1000);
  });
});

describe("travel", () => {
  it("bornes incluses", () => {
    expect(travelFeeForKm(0, DEFAULT_BANDS)).toBe(500);
    expect(travelFeeForKm(5, DEFAULT_BANDS)).toBe(500);
    expect(travelFeeForKm(5.01, DEFAULT_BANDS)).toBe(1000);
    expect(travelFeeForKm(10, DEFAULT_BANDS)).toBe(1000);
    expect(travelFeeForKm(15, DEFAULT_BANDS)).toBe(1500);
    expect(travelFeeForKm(15.01, DEFAULT_BANDS)).toBe(2000);
    expect(travelFeeForKm(null, DEFAULT_BANDS)).toBe(0);
  });
  it("calcule les distances de l'agglomération", () => {
    const empalot = [43.5802, 1.4443] as const;
    const colomiers = haversineKm(...empalot, 43.6115, 1.335);
    expect(colomiers).toBeGreaterThan(9);
    expect(colomiers).toBeLessThan(10);
    expect(travelFeeForKm(colomiers, DEFAULT_BANDS)).toBe(1000);
  });
});

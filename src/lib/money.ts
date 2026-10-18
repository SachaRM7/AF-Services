// Montants en centimes (entiers). Aucun calcul monétaire en virgule flottante.

/** Arrondi "demi loin de zéro" d'une fraction entière num/den, identique à round(numeric) de PostgreSQL. */
export function divRound(num: bigint, den: bigint): bigint {
  if (den === 0n) throw new Error("Division par zéro");
  const neg = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const q = (2n * n + d) / (2n * d);
  return neg ? -q : q;
}

/** Quantité décimale (jusqu'à 3 décimales) → millièmes entiers. Accepte "12,5" ou "12.5". */
export function parseQuantity(input: string | number): bigint {
  const s = String(input).trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return 0n;
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) throw new Error(`Quantité invalide : ${input}`);
  const [, sign, int = "", frac = ""] = m;
  if (frac.length > 3) {
    // au-delà de 3 décimales : arrondi
    const scaled = BigInt((int || "0") + frac);
    const v = divRound(scaled, 10n ** BigInt(frac.length - 3));
    return sign ? -v : v;
  }
  const v = BigInt((int || "0") + frac.padEnd(3, "0"));
  return sign ? -v : v;
}

/** Saisie en euros ("12,50", "12.5", "12") → centimes. */
export function parseEuros(input: string | number): number {
  const s = String(input).trim().replace(/\s|€/g, "").replace(",", ".");
  if (s === "") return 0;
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) throw new Error(`Montant invalide : ${input}`);
  const [, sign, int = "", frac = ""] = m;
  let cents: bigint;
  if (frac.length > 2) cents = divRound(BigInt((int || "0") + frac), 10n ** BigInt(frac.length - 2));
  else cents = BigInt((int || "0") + frac.padEnd(2, "0"));
  return Number(sign ? -cents : cents);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const neg = cents < 0;
  const a = Math.abs(cents);
  const s = `${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function formatEuros(cents: number | bigint | null | undefined): string {
  if (cents == null) return "—";
  const c = typeof cents === "bigint" ? Number(cents) : cents;
  // division exacte pour l'affichage : c est un entier
  return eur.format(c / 100);
}

/** Variante sans espaces insécables fines (pour les polices standard des PDF). */
export function formatEurosPdf(cents: number | null | undefined): string {
  return formatEuros(cents).replace(/[  ]/g, " ");
}

export function formatQuantity(q: number | string): string {
  const n = typeof q === "string" ? Number(q.replace(",", ".")) : q;
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
}

export function bpsToPercentInput(bps: number | null | undefined): string {
  if (bps == null) return "";
  return centsToInput(bps).replace(/,00$/, "");
}

export function percentInputToBps(input: string): number {
  return parseEuros(input);
}

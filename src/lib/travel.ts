// Distance à vol d'oiseau et tranches de frais de déplacement.
// Miroir de public.haversine_km / public.travel_fee_for_km.

export interface TravelBand {
  max_km: number | null;
  fee_cents: number;
  label: string;
}

export const DEFAULT_BASE = { label: "Empalot, Toulouse", lat: 43.5802, lng: 1.4443 };

export const DEFAULT_BANDS: TravelBand[] = [
  { max_km: 5, fee_cents: 500, label: "Zone 1 — jusqu'à 5 km" },
  { max_km: 10, fee_cents: 1000, label: "Zone 2 — de 5 à 10 km" },
  { max_km: 15, fee_cents: 1500, label: "Zone 3 — de 10 à 15 km" },
  { max_km: null, fee_cents: 2000, label: "Zone 4 — au-delà de 15 km" },
];

const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance en km arrondie au centième (même formule et même arrondi que la base). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100;
}

export function sortBands(bands: TravelBand[]): TravelBand[] {
  return [...bands].sort((a, b) => (a.max_km ?? Infinity) - (b.max_km ?? Infinity));
}

/** Première tranche dont la borne (incluse) couvre la distance. */
export function bandForKm(km: number, bands: TravelBand[]): TravelBand | null {
  return sortBands(bands).find((b) => b.max_km == null || km <= b.max_km) ?? null;
}

export function travelFeeForKm(km: number | null | undefined, bands: TravelBand[]): number {
  if (km == null) return 0;
  return bandForKm(km, bands)?.fee_cents ?? 0;
}

export function bandRangeLabel(band: TravelBand, bands: TravelBand[]): string {
  const sorted = sortBands(bands);
  const i = sorted.indexOf(band);
  const prev = i > 0 ? sorted[i - 1].max_km : null;
  const fmt = (n: number) => n.toLocaleString("fr-FR");
  if (band.max_km == null) return prev == null ? "Toutes distances" : `Plus de ${fmt(prev)} km`;
  if (prev == null) return `De 0 à ${fmt(band.max_km)} km inclus`;
  return `Plus de ${fmt(prev)} à ${fmt(band.max_km)} km`;
}

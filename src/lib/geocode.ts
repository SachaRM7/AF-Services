// Géocodage des adresses françaises via le service public de la Géoplateforme (IGN, Base Adresse Nationale).
// Gratuit, sans clé, CORS ouvert. Repli sur l'ancienne API adresse si besoin.

export interface GeoResult {
  label: string;
  street: string;
  postcode: string;
  city: string;
  lat: number;
  lng: number;
  score: number;
}

const ENDPOINTS = [
  "https://data.geopf.fr/geocodage/search",
  "https://api-adresse.data.gouv.fr/search/",
];

// Centre de l'agglomération toulousaine pour prioriser les résultats proches.
const BIAS = { lat: 43.6, lon: 1.44 };

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: { label: string; name?: string; housenumber?: string; street?: string; postcode: string; city: string; score: number };
}

export async function searchAddress(q: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const query = q.trim();
  if (query.length < 4) return [];
  let lastError: unknown;
  for (const endpoint of ENDPOINTS) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "6");
      url.searchParams.set("lat", String(BIAS.lat));
      url.searchParams.set("lon", String(BIAS.lon));
      if (endpoint.includes("geopf")) url.searchParams.set("index", "address");
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Géocodage indisponible (${res.status})`);
      const json = (await res.json()) as { features: Feature[] };
      return json.features.map((f) => ({
        label: f.properties.label,
        street: f.properties.name ?? [f.properties.housenumber, f.properties.street].filter(Boolean).join(" "),
        postcode: f.properties.postcode,
        city: f.properties.city,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        score: f.properties.score,
      }));
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Géocodage indisponible");
}

/** Distance routière indicative (OSRM public). Ne sert jamais au calcul des frais. */
export async function roadDistanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<number | null> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { routes?: { distance: number }[] };
    const m = json.routes?.[0]?.distance;
    return m == null ? null : Math.round(m / 100) / 10;
  } catch {
    return null;
  }
}

import { useEffect, useState } from "react";
import { publicApiConfigured, publicRpc, publicSelect } from "./publicApi";
import { DEFAULT_BANDS, DEFAULT_BASE, type TravelBand } from "./travel";

export interface PublicConfig {
  trade_name: string;
  tagline: string;
  phone: string;
  email: string;
  base_label: string;
  base_lat: number;
  base_lng: number;
  manual_review_km: number;
  legal_name: string;
  legal_form: string;
  siret: string;
  address: string;
  bands: TravelBand[];
  /** Catégories proposées dans le formulaire public (null = toutes). */
  publicCategories: string[] | null;
}

export const DEFAULT_CONFIG: PublicConfig = {
  trade_name: "AF Nettoyage",
  tagline: "Vitrerie & Entretien",
  phone: "",
  email: "",
  base_label: DEFAULT_BASE.label,
  base_lat: DEFAULT_BASE.lat,
  base_lng: DEFAULT_BASE.lng,
  manual_review_km: 25,
  legal_name: "",
  legal_form: "",
  siret: "",
  address: "",
  bands: DEFAULT_BANDS,
  publicCategories: null,
};

let cache: Promise<PublicConfig> | null = null;

export function loadPublicConfig(): Promise<PublicConfig> {
  if (!publicApiConfigured) return Promise.resolve(DEFAULT_CONFIG);
  cache ??= (async (): Promise<PublicConfig> => {
    const [d, cats] = await Promise.all([
      publicRpc<Record<string, unknown>>("get_public_config"),
      publicSelect<{ slug: string }[]>("service_categories", "select=slug&is_public=eq.true").catch(() => null),
    ]);
    if (!d) return DEFAULT_CONFIG;
    return {
      ...DEFAULT_CONFIG,
      ...d,
      base_lat: Number(d.base_lat),
      base_lng: Number(d.base_lng),
      manual_review_km: Number(d.manual_review_km),
      bands: ((d.bands as TravelBand[]) ?? DEFAULT_BANDS).map((b) => ({
        ...b,
        max_km: b.max_km == null ? null : Number(b.max_km),
        fee_cents: Number(b.fee_cents),
      })),
      publicCategories: cats ? cats.map((c) => c.slug) : null,
    } as PublicConfig;
  })().catch(() => DEFAULT_CONFIG);
  return cache;
}

export function usePublicConfig(): PublicConfig {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    let alive = true;
    loadPublicConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

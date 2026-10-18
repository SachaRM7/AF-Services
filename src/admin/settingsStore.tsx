import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { must, supabase } from "../lib/supabase";
import type { CompanySettings, Service, ServiceCategory, TravelBandRow } from "../lib/types";

interface SettingsState {
  settings: CompanySettings | null;
  bands: TravelBandRow[];
  categories: ServiceCategory[];
  services: Service[];
  reload: () => Promise<void>;
}

const Ctx = createContext<SettingsState>({ settings: null, bands: [], categories: [], services: [], reload: async () => {} });

const num = (v: unknown) => (v == null ? null : Number(v));

/** Paramètres, tranches et catalogue partagés par toute l'administration. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<SettingsState, "reload">>({ settings: null, bands: [], categories: [], services: [] });
  const reload = useCallback(async () => {
    const [settings, bands, categories, services] = await Promise.all([
      must(supabase.from("company_settings").select("*").eq("id", 1).single()),
      must(supabase.from("travel_bands").select("*")),
      must(supabase.from("service_categories").select("*").order("sort_order")),
      must(supabase.from("services").select("*").order("sort_order")),
    ]);
    const s = settings as CompanySettings;
    setState({
      settings: { ...s, base_lat: Number(s.base_lat), base_lng: Number(s.base_lng), manual_review_km: Number(s.manual_review_km) },
      bands: (bands as TravelBandRow[]).map((b) => ({ ...b, max_km: num(b.max_km), fee_cents: Number(b.fee_cents) })),
      categories: categories as ServiceCategory[],
      services: (services as Service[]).map((sv) => ({ ...sv, unit_price_cents: Number(sv.unit_price_cents) })),
    });
  }, []);
  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);
  return <Ctx.Provider value={{ ...state, reload }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);

// Validation des formulaires publics (pure, testée unitairement).

const CATEGORY_SLUGS = [
  "vitrerie-particuliers", "vitrines-commerces", "bureaux", "sanitaires",
  "parties-communes", "apres-demenagement", "apres-travaux",
];
const FREQUENCIES = ["ponctuelle", "hebdomadaire", "bimensuelle", "deux_fois_par_mois", "mensuelle", "autre"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MIN_FILL_MS = 2500;

export interface CleanSubmission {
  kind: "devis" | "contact";
  customer_type: "particulier" | "professionnel";
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
  phone: string;
  address_line1: string;
  postal_code: string;
  city: string;
  lat: number | null;
  lng: number | null;
  category_slugs: string[];
  surface_m2: number | null;
  quantity: string;
  frequency: string;
  access_info: string;
  preferred_dates: string;
  message: string;
  photos: { name: string; type: string; size: number }[];
  turnstile_token?: string;
}

export type ValidationResult =
  | { kind: "ok"; data: CleanSubmission }
  | { kind: "bot" }
  | { kind: "invalid"; error: string };

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "";

export function validateSubmission(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { kind: "invalid", error: "Requête invalide." };
  const b = input as Record<string, unknown>;

  if (str(b.website, 200) !== "") return { kind: "bot" };
  if (typeof b.elapsed_ms !== "number" || b.elapsed_ms < MIN_FILL_MS) return { kind: "bot" };

  const kind = b.kind === "contact" ? "contact" : "devis";
  const customer_type = b.customer_type === "professionnel" ? "professionnel" : "particulier";
  const email = str(b.email, 200).toLowerCase();
  const last_name = str(b.last_name, 100);

  if (b.consent !== true) return { kind: "invalid", error: "Le consentement est requis." };
  if (!last_name) return { kind: "invalid", error: "Le nom est requis." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { kind: "invalid", error: "Adresse e-mail invalide." };

  const phone = str(b.phone, 30);
  if (phone && !/^[+()\d\s.-]{6,30}$/.test(phone)) return { kind: "invalid", error: "Numéro de téléphone invalide." };

  const category_slugs = Array.isArray(b.category_slugs)
    ? [...new Set(b.category_slugs.filter((s): s is string => typeof s === "string" && CATEGORY_SLUGS.includes(s)))]
    : [];
  const address_line1 = str(b.address_line1, 200);
  const message = str(b.message, 4000);

  if (kind === "devis") {
    if (!category_slugs.length) return { kind: "invalid", error: "Choisissez au moins une prestation." };
    if (!address_line1) return { kind: "invalid", error: "L'adresse de l'intervention est requise." };
    if (customer_type === "professionnel" && !str(b.company_name, 150))
      return { kind: "invalid", error: "Le nom de l'entreprise est requis." };
  } else if (message.length < 5) {
    return { kind: "invalid", error: "Le message est trop court." };
  }

  // Coordonnées : uniquement si plausibles (France métropolitaine)
  let lat = typeof b.lat === "number" ? b.lat : null;
  let lng = typeof b.lng === "number" ? b.lng : null;
  if (lat == null || lng == null || lat < 41 || lat > 51.5 || lng < -5.5 || lng > 10) {
    lat = null;
    lng = null;
  }

  const surfaceRaw = str(b.surface_m2, 20).replace(",", ".");
  const surface = surfaceRaw && /^\d{1,6}(\.\d{1,2})?$/.test(surfaceRaw) ? Number(surfaceRaw) : null;

  const photos = Array.isArray(b.photos)
    ? b.photos
        .filter(
          (p): p is { name: string; type: string; size: number } =>
            !!p && typeof p === "object" && PHOTO_TYPES.includes((p as { type: string }).type) &&
            typeof (p as { size: number }).size === "number" && (p as { size: number }).size <= 10 * 1024 * 1024,
        )
        .slice(0, 5)
        .map((p) => ({ name: str(p.name, 200) || "photo", type: p.type, size: Math.round(p.size) }))
    : [];

  const frequency = FREQUENCIES.includes(str(b.frequency, 30)) ? str(b.frequency, 30) : "";

  return {
    kind: "ok",
    data: {
      kind,
      customer_type,
      first_name: str(b.first_name, 100),
      last_name,
      company_name: customer_type === "professionnel" ? str(b.company_name, 150) : "",
      email,
      phone,
      address_line1,
      postal_code: str(b.postal_code, 10),
      city: str(b.city, 100),
      lat,
      lng,
      category_slugs,
      surface_m2: surface,
      quantity: str(b.quantity, 100),
      frequency,
      access_info: str(b.access_info, 1000),
      preferred_dates: str(b.preferred_dates, 300),
      message,
      photos: kind === "devis" ? photos : [],
      turnstile_token: str(b.turnstile_token, 2048) || undefined,
    },
  };
}

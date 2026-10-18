import { describe, expect, it } from "vitest";
import { validateSubmission } from "./validate";

const valid = {
  kind: "devis",
  customer_type: "particulier",
  last_name: "Durand",
  email: "marie@example.fr",
  address_line1: "1 rue de Metz",
  category_slugs: ["vitrerie-particuliers", "inconnu"],
  consent: true,
  elapsed_ms: 30000,
  lat: 43.6,
  lng: 1.44,
  surface_m2: "12,5",
  photos: [{ name: "a.jpg", type: "image/jpeg", size: 1000 }, { name: "x.exe", type: "application/x-msdownload", size: 10 }],
};

describe("validateSubmission", () => {
  it("accepte une demande valide et nettoie les champs", () => {
    const r = validateSubmission(valid);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.data.category_slugs).toEqual(["vitrerie-particuliers"]);
    expect(r.data.surface_m2).toBe(12.5);
    expect(r.data.photos).toHaveLength(1);
  });
  it("détecte le pot de miel et les envois trop rapides", () => {
    expect(validateSubmission({ ...valid, website: "http://spam" }).kind).toBe("bot");
    expect(validateSubmission({ ...valid, elapsed_ms: 200 }).kind).toBe("bot");
  });
  it("refuse sans consentement, e-mail ou prestation", () => {
    expect(validateSubmission({ ...valid, consent: false }).kind).toBe("invalid");
    expect(validateSubmission({ ...valid, email: "pas-un-email" }).kind).toBe("invalid");
    expect(validateSubmission({ ...valid, category_slugs: [] }).kind).toBe("invalid");
    expect(validateSubmission({ ...valid, customer_type: "professionnel" }).kind).toBe("invalid");
  });
  it("ignore les coordonnées hors de France", () => {
    const r = validateSubmission({ ...valid, lat: 0, lng: 0 });
    expect(r.kind === "ok" && r.data.lat).toBe(null);
  });
  it("valide un message de contact", () => {
    expect(validateSubmission({ kind: "contact", last_name: "A", email: "a@b.fr", message: "Bonjour, une question", consent: true, elapsed_ms: 9000 }).kind).toBe("ok");
  });
});

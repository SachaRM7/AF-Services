import { useCallback, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Camera, Check, CheckCircle2, Loader2, X } from "lucide-react";
import { AddressSearch } from "../components/AddressSearch";
import { Turnstile, turnstileEnabled } from "../components/Turnstile";
import { useSeo } from "../components/Seo";
import { FREQUENCIES, SERVICES } from "../lib/content";
import { usePublicConfig } from "../lib/publicConfig";
import { bandForKm, haversineKm } from "../lib/travel";
import { formatEuros } from "../lib/money";
import { cx, formatKm } from "../lib/format";
import type { GeoResult } from "../lib/geocode";
import { shrinkImage, submitPublicForm, uploadPhotos } from "../lib/submit";

const MAX_PHOTOS = 5;
const MAX_SIZE = 10 * 1024 * 1024;

function Section({ n, title, children, hint }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-stone/50 py-8 first:border-t-0 first:pt-0">
      <legend className="float-left mb-5 flex w-full items-baseline gap-3">
        <span className="font-display text-2xl text-stone">{String(n).padStart(2, "0")}</span>
        <span className="text-lg font-semibold">{title}</span>
      </legend>
      {hint && <p className="clear-both -mt-2 mb-4 text-sm text-ink-muted">{hint}</p>}
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

export default function QuoteRequest() {
  const [params] = useSearchParams();
  const config = usePublicConfig();
  const startedAt = useRef(Date.now());
  useSeo({
    title: "Demande de devis gratuit — AF Nettoyage Toulouse",
    description: "Demandez un devis personnalisé pour vos vitres, vitrines, bureaux, sanitaires ou parties communes à Toulouse et alentours.",
    path: "/devis",
  });

  const [type, setType] = useState<"particulier" | "professionnel">(
    params.get("type") === "professionnel" ? "professionnel" : "particulier",
  );
  const [cats, setCats] = useState<string[]>(() => {
    const p = params.get("prestation");
    return p && SERVICES.some((s) => s.slug === p) ? [p] : [];
  });
  const [address, setAddress] = useState(params.get("adresse") ?? "");
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [form, setForm] = useState({
    surface_m2: "",
    quantity: "",
    frequency: "ponctuelle",
    floor: "",
    access_info: "",
    preferred_dates: "",
    message: "",
    first_name: "",
    last_name: "",
    company_name: "",
    email: "",
    phone: "",
    website: "",
  });
  const [consent, setConsent] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onToken = useCallback((t: string) => setTurnstileToken(t), []);

  const selected = SERVICES.filter((s) => cats.includes(s.slug));
  const asks = new Set(selected.flatMap((s) => s.asks));
  const quantityLabel = selected.find((s) => s.quantityLabel)?.quantityLabel ?? "Quantité (fenêtres, pièces, étages…)";
  const km = geo ? haversineKm(config.base_lat, config.base_lng, geo.lat, geo.lng) : null;
  const band = km != null ? bandForKm(km, config.bands) : null;

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!cats.length) e.push("Choisissez au moins une prestation.");
    if (!address.trim()) e.push("Indiquez l'adresse de l'intervention.");
    if (!form.last_name.trim()) e.push("Indiquez votre nom.");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.push("Indiquez une adresse e-mail valide.");
    if (type === "professionnel" && !form.company_name.trim()) e.push("Indiquez le nom de l'entreprise ou de la structure.");
    if (!consent) e.push("Acceptez le traitement de vos données pour que nous puissions vous répondre.");
    if (turnstileEnabled && !turnstileToken) e.push("Validez la vérification anti-robot.");
    return e;
  }, [cats, address, form, type, consent, turnstileToken]);

  async function addPhotos(list: FileList | null) {
    if (!list) return;
    setPhotoWarning(null);
    const next = [...photos];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_PHOTOS) {
        setPhotoWarning(`${MAX_PHOTOS} photos maximum.`);
        break;
      }
      if (!f.type.startsWith("image/")) continue;
      const small = await shrinkImage(f);
      if (small.size > MAX_SIZE) {
        setPhotoWarning("Une photo dépasse 10 Mo et n'a pas été ajoutée.");
        continue;
      }
      next.push(small);
    }
    setPhotos(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setStatus("sending");
    try {
      const access = [form.floor && `Étage / niveau : ${form.floor}`, form.access_info].filter(Boolean).join("\n");
      const res = await submitPublicForm({
        kind: "devis",
        customer_type: type,
        first_name: form.first_name,
        last_name: form.last_name,
        company_name: type === "professionnel" ? form.company_name : "",
        email: form.email,
        phone: form.phone,
        address_line1: geo?.street || address,
        postal_code: geo?.postcode ?? "",
        city: geo?.city ?? "",
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        category_slugs: cats,
        surface_m2: asks.has("surface") ? form.surface_m2 : "",
        quantity: asks.has("quantity") ? form.quantity : "",
        frequency: asks.has("frequency") ? form.frequency : "ponctuelle",
        access_info: access,
        preferred_dates: form.preferred_dates,
        message: form.message,
        consent,
        photos: photos.map((p) => ({ name: p.name, type: p.type, size: p.size })),
        website: form.website,
        elapsed_ms: Date.now() - startedAt.current,
        turnstile_token: turnstileToken,
      });
      if (photos.length && res.uploads.length) {
        const failed = await uploadPhotos(photos, res.uploads);
        if (failed) setPhotoWarning(`${failed} photo(s) n'ont pas pu être transmises. Vous pourrez les envoyer lors de notre échange.`);
      }
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="container-page max-w-2xl pt-16 md:pt-24">
        <CheckCircle2 className="h-12 w-12" strokeWidth={1.3} aria-hidden />
        <h1 className="display mt-6 text-5xl">Demande bien reçue.</h1>
        <p className="mt-5 text-lg text-ink-soft">
          Merci {form.first_name || form.last_name}. Votre demande a été enregistrée. Nous revenons vers vous rapidement,
          par e-mail{form.phone ? " ou par téléphone" : ""}, pour préciser votre besoin et, si nécessaire, convenir d'une visite.
        </p>
        {photoWarning && <p className="mt-4 rounded-xl bg-paper-deep p-4 text-sm">{photoWarning}</p>}
        <p className="mt-4 text-sm text-ink-muted">
          Aucun engagement à ce stade : seul un devis accepté de votre part vaut commande.
        </p>
        <Link to="/" className="btn-secondary mt-8">Retour à l'accueil</Link>
      </div>
    );
  }

  return (
    <div className="container-page grid gap-12 pt-12 md:pt-16 lg:grid-cols-[1fr_20rem]">
      <div>
        <p className="eyebrow">Devis gratuit</p>
        <h1 className="display mt-3 text-5xl sm:text-6xl">Parlez-nous de votre besoin.</h1>
        <p className="mt-4 max-w-2xl text-ink-soft">
          Deux minutes suffisent. Plus votre description est précise, plus le devis le sera. Les champs marqués * sont nécessaires.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-10 max-w-2xl">
          {/* pot de miel, invisible pour les humains */}
          <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
            <label>
              Site web
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
            </label>
          </div>

          <Section n={1} title="Vous êtes *">
            <div className="grid grid-cols-2 gap-3">
              {(["particulier", "professionnel"] as const).map((t) => (
                <label key={t} className={cx("flex cursor-pointer items-center justify-center rounded-xl border px-4 py-3.5 font-semibold transition", type === t ? "border-ink bg-ink text-paper" : "border-stone bg-white hover:border-ink")}>
                  <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
                  {t === "particulier" ? "Particulier" : "Professionnel"}
                </label>
              ))}
            </div>
          </Section>

          <Section n={2} title="Prestations souhaitées *" hint="Plusieurs choix possibles.">
            <div className="grid gap-2 sm:grid-cols-2">
              {SERVICES.filter((s) => !config.publicCategories || config.publicCategories.includes(s.slug) || cats.includes(s.slug)).map((s) => {
                const on = cats.includes(s.slug);
                return (
                  <label key={s.slug} className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition", on ? "border-ink bg-white" : "border-stone/60 bg-white/60 hover:border-ink")}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => setCats((c) => (on ? c.filter((x) => x !== s.slug) : [...c, s.slug]))}
                    />
                    <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border", on ? "border-ink bg-ink text-paper" : "border-stone")}>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{s.name}</span>
                      <span className="block text-xs text-ink-muted">{s.short}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Section>

          <Section n={3} title="Adresse de l'intervention *">
            <AddressSearch value={address} onChange={(v) => { setAddress(v); setGeo(null); }} onSelect={setGeo} required />
            <p className="field-hint">Choisissez l'adresse dans la liste pour connaître les frais de déplacement.</p>
            {band && km != null && (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl bg-white p-4 text-sm" aria-live="polite">
                <span>Distance : <strong>{formatKm(km)}</strong></span>
                <span>Déplacement : <strong>{formatEuros(band.fee_cents)} HT</strong></span>
                <span className="text-ink-muted">{band.label}</span>
                {km > config.manual_review_km && (
                  <span className="mt-2 flex w-full gap-2 text-ink-soft">
                    <AlertTriangle className="h-4 w-4" aria-hidden /> Adresse éloignée : faisabilité confirmée avec vous.
                  </span>
                )}
              </div>
            )}
          </Section>

          <Section n={4} title="Le chantier" hint="Approximations bienvenues — elles seront vérifiées ensemble.">
            <div className="grid gap-5 sm:grid-cols-2">
              {asks.has("surface") && (
                <div>
                  <label className="field-label" htmlFor="surface">Surface estimée (m²)</label>
                  <input id="surface" inputMode="decimal" className="input" value={form.surface_m2} onChange={set("surface_m2")} placeholder="Ex. 25" />
                  <p className="field-hint">Surface vitrée pour la vitrerie, surface au sol sinon.</p>
                </div>
              )}
              {asks.has("quantity") && (
                <div>
                  <label className="field-label" htmlFor="quantity">{quantityLabel}</label>
                  <input id="quantity" className="input" value={form.quantity} onChange={set("quantity")} />
                </div>
              )}
              {asks.has("frequency") && (
                <div>
                  <label className="field-label" htmlFor="frequency">Fréquence</label>
                  <select id="frequency" className="input" value={form.frequency} onChange={set("frequency")}>
                    {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="field-label" htmlFor="floor">Étage / niveau</label>
                <input id="floor" className="input" value={form.floor} onChange={set("floor")} placeholder="Ex. RDC, 3e avec ascenseur" />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="access">Accès, stationnement, contraintes</label>
                <textarea id="access" rows={2} className="input" value={form.access_info} onChange={set("access_info")} placeholder="Digicode, parking, horaires possibles, hauteur des vitres…" />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="dates">Dates ou délais souhaités</label>
                <input id="dates" className="input" value={form.preferred_dates} onChange={set("preferred_dates")} placeholder="Ex. avant le 15, plutôt le matin" />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="message">Observations</label>
                <textarea id="message" rows={4} className="input" value={form.message} onChange={set("message")} placeholder="État général, particularités, questions…" />
              </div>
            </div>
          </Section>

          <Section n={5} title="Photos (facultatif)" hint={`Jusqu'à ${MAX_PHOTOS} photos. Elles aident à estimer le temps et le matériel. Évitez de photographier des personnes.`}>
            <div className="flex flex-wrap gap-3">
              {photos.map((p, i) => (
                <div key={`${p.name}-${i}`} className="relative h-24 w-24 overflow-hidden rounded-xl border border-stone/50 bg-white">
                  <img src={URL.createObjectURL(p)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-ink/80 p-1 text-paper" aria-label={`Retirer la photo ${i + 1}`}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-stone bg-white text-xs text-ink-muted hover:border-ink">
                  <Camera className="h-5 w-5" aria-hidden />
                  Ajouter
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {photoWarning && <p className="field-hint text-red-800">{photoWarning}</p>}
          </Section>

          <Section n={6} title="Vos coordonnées">
            <div className="grid gap-5 sm:grid-cols-2">
              {type === "professionnel" && (
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="company">Entreprise / structure *</label>
                  <input id="company" className="input" autoComplete="organization" value={form.company_name} onChange={set("company_name")} />
                </div>
              )}
              <div>
                <label className="field-label" htmlFor="first">Prénom</label>
                <input id="first" className="input" autoComplete="given-name" value={form.first_name} onChange={set("first_name")} />
              </div>
              <div>
                <label className="field-label" htmlFor="last">Nom *</label>
                <input id="last" className="input" autoComplete="family-name" value={form.last_name} onChange={set("last_name")} />
              </div>
              <div>
                <label className="field-label" htmlFor="email">E-mail *</label>
                <input id="email" type="email" className="input" autoComplete="email" value={form.email} onChange={set("email")} />
              </div>
              <div>
                <label className="field-label" htmlFor="phone">Téléphone</label>
                <input id="phone" type="tel" className="input" autoComplete="tel" value={form.phone} onChange={set("phone")} />
              </div>
            </div>
            <label className="mt-6 flex cursor-pointer gap-3 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
              <span>
                J'accepte que les informations saisies soient utilisées pour traiter ma demande et établir un devis. Elles ne
                sont ni cédées ni utilisées à des fins publicitaires. <Link to="/confidentialite" className="underline">En savoir plus</Link>. *
              </span>
            </label>
            <Turnstile onToken={onToken} />
          </Section>

          {error && (
            <p role="alert" className="mb-4 rounded-xl border border-red-900/30 bg-red-50 p-4 text-sm text-red-900">{error}</p>
          )}
          <button type="submit" className="btn-primary w-full py-3.5 text-base sm:w-auto sm:px-10" disabled={status === "sending"}>
            {status === "sending" ? <><Loader2 className="h-4 w-4 animate-spin" /> Envoi en cours…</> : "Envoyer ma demande"}
          </button>
        </form>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-6 text-sm">
          <div className="card p-6">
            <p className="eyebrow">Ce qui se passe ensuite</p>
            <ol className="mt-4 space-y-3">
              <li><strong>1.</strong> Votre demande est étudiée.</li>
              <li><strong>2.</strong> Nous vous recontactons pour préciser ou planifier un diagnostic.</li>
              <li><strong>3.</strong> Vous recevez un devis détaillé, sans engagement.</li>
            </ol>
          </div>
          <p className="px-1 text-ink-muted">
            Les frais de déplacement sont fixes par zone et ajoutés au prix de la prestation. Un minimum d'intervention
            s'applique, hors déplacement.
          </p>
        </div>
      </aside>
    </div>
  );
}

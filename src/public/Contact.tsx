import { useCallback, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Mail, MapPin, Phone } from "lucide-react";
import { useSeo } from "../components/Seo";
import { Turnstile, turnstileEnabled } from "../components/Turnstile";
import { usePublicConfig } from "../lib/publicConfig";
import { submitPublicForm } from "../lib/submit";

export default function Contact() {
  const config = usePublicConfig();
  const startedAt = useRef(Date.now());
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const onToken = useCallback((t: string) => setToken(t), []);
  useSeo({
    title: "Contact — AF Nettoyage, vitrerie et entretien à Toulouse",
    description: "Contactez AF Nettoyage pour une question ou une demande d'intervention à Toulouse et dans l'agglomération.",
    path: "/contact",
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email) || f.message.trim().length < 5) {
      setError("Merci d'indiquer votre nom, un e-mail valide et votre message.");
      return;
    }
    if (!consent) return setError("Merci d'accepter le traitement de vos données pour que nous puissions répondre.");
    if (turnstileEnabled && !token) return setError("Validez la vérification anti-robot.");
    setState("sending");
    try {
      await submitPublicForm({
        kind: "contact",
        customer_type: "particulier",
        first_name: "",
        last_name: f.name,
        email: f.email,
        phone: f.phone,
        message: f.message,
        consent,
        website: f.website,
        elapsed_ms: Date.now() - startedAt.current,
        turnstile_token: token,
      });
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  return (
    <div className="container-page grid gap-14 pt-12 md:grid-cols-[1fr_1.2fr] md:pt-20">
      <div>
        <p className="eyebrow">Contact</p>
        <h1 className="display mt-3 text-5xl sm:text-6xl">Une question ?</h1>
        <p className="mt-5 text-lg text-ink-soft">
          Pour une demande d'intervention, le <Link to="/devis" className="underline">formulaire de devis</Link> est le plus
          rapide : il réunit toutes les informations utiles. Pour tout le reste, écrivez-nous.
        </p>
        <ul className="mt-10 space-y-5">
          {config.phone && (
            <li className="flex gap-3"><Phone className="mt-0.5 h-5 w-5" strokeWidth={1.5} aria-hidden /><a className="hover:underline" href={`tel:${config.phone.replace(/\s/g, "")}`}>{config.phone}</a></li>
          )}
          {config.email && (
            <li className="flex gap-3"><Mail className="mt-0.5 h-5 w-5" strokeWidth={1.5} aria-hidden /><a className="hover:underline" href={`mailto:${config.email}`}>{config.email}</a></li>
          )}
          <li className="flex gap-3">
            <MapPin className="mt-0.5 h-5 w-5" strokeWidth={1.5} aria-hidden />
            <span>
              Basé à {config.base_label}
              <br />
              <span className="text-sm text-ink-muted">Interventions à Toulouse, Colomiers, Tournefeuille, Blagnac et dans l'agglomération — <Link to="/zone-intervention" className="underline">voir la zone</Link></span>
            </span>
          </li>
        </ul>
      </div>

      <div className="card p-6 sm:p-10">
        {state === "done" ? (
          <div>
            <CheckCircle2 className="h-10 w-10" strokeWidth={1.3} aria-hidden />
            <h2 className="display mt-4 text-4xl">Message envoyé.</h2>
            <p className="mt-3 text-ink-soft">Merci, nous vous répondons dans les meilleurs délais.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
              <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor="c-name">Nom *</label>
              <input id="c-name" className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="c-email">E-mail *</label>
                <input id="c-email" type="email" className="input" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </div>
              <div>
                <label className="field-label" htmlFor="c-phone">Téléphone</label>
                <input id="c-phone" type="tel" className="input" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="c-msg">Message *</label>
              <textarea id="c-msg" rows={6} className="input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
            </div>
            <label className="flex cursor-pointer gap-3 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
              <span>J'accepte que ces informations soient utilisées pour répondre à mon message. <Link to="/confidentialite" className="underline">Confidentialité</Link>. *</span>
            </label>
            <Turnstile onToken={onToken} />
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p>}
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={state === "sending"}>
              {state === "sending" ? <><Loader2 className="h-4 w-4 animate-spin" /> Envoi…</> : "Envoyer"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

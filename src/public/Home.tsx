import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck, FileText, MapPinned, Ruler } from "lucide-react";
import { SERVICES } from "../lib/content";
import { usePublicConfig } from "../lib/publicConfig";
import { formatEuros } from "../lib/money";
import { bandRangeLabel, sortBands } from "../lib/travel";
import { useSeo } from "../components/Seo";
import { WindowMark } from "./WindowMark";

const PROMISES = [
  { icon: FileText, title: "Devis gratuit et détaillé", text: "Chaque ligne est expliquée : prestation, quantité, déplacement." },
  { icon: ClipboardCheck, title: "Diagnostic sur place", text: "Pour les chantiers qui le justifient, avant tout engagement." },
  { icon: MapPinned, title: "Déplacement transparent", text: "Un forfait fixe par zone, publié à l'avance sur ce site." },
  { icon: Ruler, title: "Prix au juste besoin", text: "Établis selon la surface, le temps, l'état et l'accès réels." },
];

const STEPS = [
  { n: "01", title: "Votre demande", text: "Quelques informations sur le lieu, la prestation et, si vous le souhaitez, des photos." },
  { n: "02", title: "Évaluation", text: "Un échange ou une visite rapide permet d'estimer le temps et le matériel nécessaires." },
  { n: "03", title: "Devis précis", text: "Vous recevez un devis détaillé, valable 30 jours, sans engagement." },
  { n: "04", title: "Intervention", text: "À la date convenue, ponctuellement ou selon un rythme régulier." },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "HomeAndConstructionBusiness",
  name: "AF Nettoyage",
  description: "Vitrerie et entretien pour particuliers et professionnels à Toulouse et dans l'agglomération.",
  areaServed: ["Toulouse", "Colomiers", "Tournefeuille", "Blagnac"].map((name) => ({ "@type": "City", name })),
  address: { "@type": "PostalAddress", addressLocality: "Toulouse", postalCode: "31400", addressCountry: "FR" },
};

export default function Home() {
  const config = usePublicConfig();
  const bands = sortBands(config.bands);
  useSeo({
    title: "AF Nettoyage — Vitrerie & entretien à Toulouse et agglomération",
    description:
      "Nettoyage de vitres, vitrines, bureaux, sanitaires, parties communes, après déménagement et après travaux à Toulouse, Colomiers, Tournefeuille, Blagnac. Devis personnalisé.",
    path: "/",
    jsonLd,
  });

  return (
    <>
      {/* Hero */}
      <section className="container-page grid items-center gap-10 pb-16 pt-10 md:grid-cols-[1.25fr_1fr] md:pb-24 md:pt-20">
        <div>
          <p className="eyebrow">Toulouse · Colomiers · Tournefeuille · Blagnac</p>
          <h1 className="display mt-5 text-[3.1rem] sm:text-7xl lg:text-[5.5rem]">
            Des vitres nettes,
            <br />
            <em className="text-ink-muted">des lieux tenus.</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            Vitrerie et entretien pour les particuliers, les commerces, les bureaux et les copropriétés. Un travail
            soigné, un devis clair, des frais de déplacement connus à l'avance.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/devis" className="btn-primary px-7 py-3 text-base">
              Demander un devis gratuit <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/prestations" className="btn-secondary px-7 py-3 text-base">
              Voir les prestations
            </Link>
          </div>
        </div>
        <div className="relative mx-auto hidden w-full max-w-sm md:block">
          <WindowMark className="w-full" />
          <div className="absolute -bottom-4 -left-10 max-w-[15rem] rounded-2xl border border-stone/40 bg-white p-4 shadow-sm">
            <p className="eyebrow">Déplacement</p>
            <p className="mt-1 text-sm">
              À partir de <strong>{formatEuros(bands[0]?.fee_cents ?? 500)} HT</strong> depuis {config.base_label}, selon un barème
              publié.
            </p>
          </div>
        </div>
      </section>

      {/* Engagements */}
      <section className="border-y border-stone/40 bg-white">
        <div className="container-page grid gap-px py-2 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4 px-1 py-6 lg:px-5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.6} aria-hidden />
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-ink-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Prestations */}
      <section className="container-page py-20 md:py-28">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Prestations</p>
            <h2 className="display mt-3 text-4xl sm:text-5xl">Sept savoir-faire, un même soin.</h2>
          </div>
          <Link to="/prestations" className="btn-ghost self-start px-0 underline-offset-4 hover:bg-transparent hover:underline md:self-auto">
            Toutes les prestations <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <ol className="mt-12 grid border-t border-stone/50 md:grid-cols-2">
          {SERVICES.map((s, i) => (
            <li key={s.slug} className="border-b border-stone/50 md:odd:border-r md:odd:pr-8 md:even:pl-8">
              <Link to={`/prestations#${s.slug}`} className="group flex items-baseline gap-5 py-6">
                <span className="font-display text-2xl text-stone">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1">
                  <span className="block text-lg font-semibold group-hover:underline">{s.name}</span>
                  <span className="mt-1 block text-sm text-ink-muted">{s.short}</span>
                </span>
                <span className="hidden text-xs font-semibold uppercase tracking-wider text-ink-muted sm:block">{s.audience}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* Méthode */}
      <section className="bg-ink py-20 text-paper md:py-28">
        <div className="container-page">
          <p className="eyebrow text-stone">Comment ça se passe</p>
          <h2 className="display mt-3 max-w-2xl text-4xl sm:text-5xl">Un prix juste se construit à partir du terrain.</h2>
          <p className="mt-5 max-w-2xl text-stone">
            Les tarifs ne sont pas affichés en ligne : une vitrine de 6 m² au rez-de-chaussée et une véranda encrassée ne
            demandent ni le même temps, ni le même matériel. Chaque devis est établi à partir de votre situation réelle.
          </p>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="border-t border-paper/20 pt-5">
                <span className="font-display text-3xl text-stone">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Zone */}
      <section className="container-page grid gap-12 py-20 md:grid-cols-2 md:py-28">
        <div>
          <p className="eyebrow">Zone d'intervention</p>
          <h2 className="display mt-3 text-4xl sm:text-5xl">Toulouse et son agglomération.</h2>
          <p className="mt-5 max-w-lg text-ink-soft">
            Les interventions partent d'{config.base_label.replace(/, Toulouse$/, "")}, au sud-est de Toulouse. Les frais de
            déplacement dépendent uniquement de la distance à vol d'oiseau, par tranches fixes, et figurent sur une ligne
            distincte du devis.
          </p>
          <Link to="/zone-intervention" className="btn-secondary mt-8">
            Calculer ma zone <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <table className="w-full self-end text-left">
          <caption className="sr-only">Frais de déplacement par distance</caption>
          <thead>
            <tr className="border-b border-ink">
              <th className="py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Distance</th>
              <th className="py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted">Frais HT</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.label} className="border-b border-stone/40">
                <td className="py-4">{bandRangeLabel(b, bands)}</td>
                <td className="py-4 text-right font-display text-2xl">{formatEuros(b.fee_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Publics */}
      <section className="container-page grid gap-5 md:grid-cols-2">
        <div className="card p-8 md:p-10">
          <p className="eyebrow">Particuliers</p>
          <h2 className="display mt-3 text-3xl">Chez vous, sans contrainte.</h2>
          <p className="mt-4 text-ink-muted">
            Vitres et baies vitrées, sanitaires, logement à rendre après un déménagement ou à remettre en état après de
            petits travaux. Envoyez quelques photos : le devis n'en sera que plus précis.
          </p>
          <Link to="/devis?type=particulier" className="btn-primary mt-6">Demande particulier</Link>
        </div>
        <div className="card bg-paper-deep p-8 md:p-10">
          <p className="eyebrow">Professionnels</p>
          <h2 className="display mt-3 text-3xl">Commerces, bureaux, copropriétés.</h2>
          <p className="mt-4 text-ink-muted">
            Vitrines, bureaux, sanitaires et parties communes, en passage ponctuel ou selon un calendrier régulier. Factures
            conformes, horaires adaptés à votre activité.
          </p>
          <Link to="/devis?type=professionnel" className="btn-primary mt-6">Demande professionnelle</Link>
        </div>
      </section>
    </>
  );
}

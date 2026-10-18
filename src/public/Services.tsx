import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { SERVICES } from "../lib/content";
import { useSeo } from "../components/Seo";
import { cx } from "../lib/format";

type Filter = "tous" | "particuliers" | "professionnels";

export default function Services() {
  const [filter, setFilter] = useState<Filter>("tous");
  const { hash } = useLocation();
  useSeo({
    title: "Prestations de vitrerie et d'entretien — AF Nettoyage Toulouse",
    description:
      "Vitrerie pour particuliers, vitrines, bureaux, sanitaires, parties communes, nettoyage après déménagement et après travaux légers à Toulouse.",
    path: "/prestations",
  });

  useEffect(() => {
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [hash]);

  const visible = SERVICES.filter(
    (s) =>
      filter === "tous" ||
      s.audience === "Particuliers & professionnels" ||
      (filter === "particuliers" ? s.audience === "Particuliers" : s.audience === "Professionnels"),
  );

  return (
    <div className="container-page pt-12 md:pt-20">
      <p className="eyebrow">Prestations</p>
      <h1 className="display mt-3 max-w-3xl text-5xl sm:text-6xl">Ce que nous faisons, et comment.</h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-soft">
        Les prix dépendent de la surface, du temps nécessaire, de l'état des lieux et des conditions d'accès. Ils ne sont
        donc pas affichés ici : chaque prestation fait l'objet d'un devis personnalisé et gratuit.
      </p>

      <div className="mt-10 inline-flex rounded-full border border-stone/60 bg-white p-1" role="tablist" aria-label="Filtrer les prestations">
        {(["tous", "particuliers", "professionnels"] as Filter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cx("rounded-full px-4 py-2 text-sm font-semibold capitalize transition", filter === f ? "bg-ink text-paper" : "text-ink-muted hover:text-ink")}
          >
            {f === "tous" ? "Tout" : f}
          </button>
        ))}
      </div>

      <div className="mt-10 border-t border-ink">
        {visible.map((s) => (
          <article key={s.slug} id={s.slug} className="grid scroll-mt-24 gap-6 border-b border-stone/50 py-12 md:grid-cols-[1fr_1.3fr] md:gap-12">
            <div>
              <p className="eyebrow">{s.audience}</p>
              <h2 className="display mt-3 text-4xl">{s.name}</h2>
              <p className="mt-4 text-ink-soft">{s.intro}</p>
              <Link to={`/devis?prestation=${s.slug}`} className="btn-primary mt-6">
                Devis pour cette prestation <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Inclus</h3>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {s.includes.map((i) => (
                  <li key={i} className="flex gap-2.5 text-[0.95rem]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {i}
                  </li>
                ))}
              </ul>
              <p className="mt-6 rounded-xl bg-paper-deep px-4 py-3 text-sm text-ink-soft">
                <strong className="font-semibold text-ink">À savoir — </strong>
                {s.limits}
              </p>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-16 grid gap-8 rounded-2xl bg-white p-8 md:grid-cols-3 md:p-10">
        <div>
          <h2 className="font-semibold">Minimum d'intervention</h2>
          <p className="mt-2 text-sm text-ink-muted">Un montant minimum de prestation s'applique par intervention, hors frais de déplacement. Il est indiqué sur le devis.</p>
        </div>
        <div>
          <h2 className="font-semibold">Interventions régulières</h2>
          <p className="mt-2 text-sm text-ink-muted">Pour les passages hebdomadaires ou mensuels, les conditions sont définies une fois pour toutes dans le devis.</p>
        </div>
        <div>
          <h2 className="font-semibold">Estimation ≠ devis</h2>
          <p className="mt-2 text-sm text-ink-muted">Seul le devis signé engage. Toute estimation communiquée avant reste indicative.</p>
        </div>
      </section>
    </div>
  );
}

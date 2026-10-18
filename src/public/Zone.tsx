import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { AddressSearch } from "../components/AddressSearch";
import { useSeo } from "../components/Seo";
import { usePublicConfig } from "../lib/publicConfig";
import { formatEuros } from "../lib/money";
import { bandForKm, bandRangeLabel, haversineKm, sortBands } from "../lib/travel";
import type { GeoResult } from "../lib/geocode";
import { formatKm } from "../lib/format";

const ZoneMap = lazy(() => import("../components/ZoneMap"));

export default function Zone() {
  const config = usePublicConfig();
  const bands = sortBands(config.bands);
  const [address, setAddress] = useState("");
  const [picked, setPicked] = useState<GeoResult | null>(null);
  useSeo({
    title: "Zone d'intervention et frais de déplacement — AF Nettoyage",
    description:
      "Interventions à Toulouse, Colomiers, Tournefeuille, Blagnac et alentours. Frais de déplacement fixes selon la distance depuis Empalot.",
    path: "/zone-intervention",
  });

  const km = picked ? haversineKm(config.base_lat, config.base_lng, picked.lat, picked.lng) : null;
  const band = km != null ? bandForKm(km, bands) : null;

  return (
    <div className="container-page pt-12 md:pt-20">
      <p className="eyebrow">Zone d'intervention</p>
      <h1 className="display mt-3 max-w-3xl text-5xl sm:text-6xl">Toulouse, et tout autour.</h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-soft">
        Toulouse et les communes de l'agglomération — Colomiers, Tournefeuille, Blagnac, Balma, L'Union, Ramonville,
        Saint-Orens, Castanet… Les déplacements partent de {config.base_label}.
      </p>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <Suspense fallback={<div className="h-[460px] animate-pulse rounded-2xl bg-paper-deep" />}>
          <ZoneMap
            base={{ lat: config.base_lat, lng: config.base_lng, label: config.base_label }}
            bands={bands}
            point={picked ? { lat: picked.lat, lng: picked.lng, label: picked.city } : null}
            className="h-[380px] sm:h-[460px]"
          />
        </Suspense>

        <div>
          <div className="card p-6">
            <label htmlFor="zone-address" className="field-label">Où se situe le chantier ?</label>
            <AddressSearch id="zone-address" value={address} onChange={setAddress} onSelect={setPicked} />
            {picked && km != null && band && (
              <div className="mt-5 border-t border-stone/40 pt-5" aria-live="polite">
                <p className="text-sm text-ink-muted">{picked.label}</p>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="eyebrow">Distance</dt>
                    <dd className="mt-1 font-display text-3xl">{formatKm(km)}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Déplacement</dt>
                    <dd className="mt-1 font-display text-3xl">{formatEuros(band.fee_cents)} <span className="font-sans text-sm">HT</span></dd>
                  </div>
                </dl>
                <p className="mt-2 text-sm">{band.label}</p>
                {km > config.manual_review_km && (
                  <p className="mt-4 flex gap-2 rounded-xl bg-paper-deep p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    Adresse éloignée : la faisabilité de l'intervention sera confirmée avec vous avant tout devis.
                  </p>
                )}
                <Link
                  to={`/devis?adresse=${encodeURIComponent(picked.label)}`}
                  className="btn-primary mt-5 w-full"
                >
                  Demander un devis à cette adresse <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          <table className="mt-8 w-full text-left text-sm">
            <caption className="mb-2 text-left font-semibold">Barème des frais de déplacement</caption>
            <tbody>
              {bands.map((b) => (
                <tr key={b.label} className="border-b border-stone/40">
                  <td className="py-3">{bandRangeLabel(b, bands)}</td>
                  <td className="py-3 text-right font-semibold">{formatEuros(b.fee_cents)} HT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-16 grid gap-8 md:grid-cols-3">
        <div>
          <h2 className="font-semibold">Distance à vol d'oiseau</h2>
          <p className="mt-2 text-sm text-ink-muted">
            La distance retenue est la ligne droite entre {config.base_label} et l'adresse du chantier. Elle ne dépend ni de
            l'itinéraire, ni de la circulation : le montant est connu à l'avance.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">En supplément, ligne distincte</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Les frais de déplacement s'ajoutent au prix de la prestation et apparaissent séparément sur le devis et la facture.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Chantiers éloignés</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Au-delà de l'agglomération, chaque demande est étudiée individuellement avant confirmation.
          </p>
        </div>
      </section>
    </div>
  );
}

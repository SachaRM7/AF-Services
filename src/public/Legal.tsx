import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSeo } from "../components/Seo";
import { usePublicConfig } from "../lib/publicConfig";

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="container-page max-w-3xl pt-12 md:pt-20">
      <h1 className="display text-5xl">{title}</h1>
      <div className="mt-10 space-y-8 leading-relaxed text-ink-soft [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </div>
  );
}

export function LegalNotice() {
  const c = usePublicConfig();
  useSeo({ title: "Mentions légales — AF Nettoyage", description: "Mentions légales du site AF Nettoyage.", path: "/mentions-legales" });
  const pending = "en cours d'immatriculation";
  return (
    <Page title="Mentions légales">
      <section>
        <h2>Éditeur du site</h2>
        <p>
          {c.trade_name}
          {c.legal_name ? ` — ${c.legal_name}` : ""}
          {c.legal_form ? ` (${c.legal_form})` : ""}
          <br />
          SIRET : {c.siret || pending}
          <br />
          Adresse : {c.address || "Toulouse (31)"}
          <br />
          {c.email && <>Contact : {c.email}<br /></>}
          {c.phone && <>Téléphone : {c.phone}<br /></>}
          Directeur de la publication : Adel Ferchichi
        </p>
        {!c.siret && (
          <p className="mt-3 text-sm">
            L'entreprise est en cours de création. Les informations d'immatriculation seront publiées ici dès leur
            obtention.
          </p>
        )}
      </section>
      <section>
        <h2>Hébergement</h2>
        <p>
          Site hébergé par Netlify, Inc., San Francisco, Californie, États-Unis — netlify.com.
          <br />
          Données applicatives hébergées par Supabase (infrastructure située dans l'Union européenne) — supabase.com.
        </p>
      </section>
      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          Les textes, éléments graphiques et la marque {c.trade_name} sont la propriété de l'éditeur. Toute reproduction
          sans autorisation est interdite. Fonds de carte © IGN – Géoplateforme.
        </p>
      </section>
      <section>
        <h2>Données personnelles</h2>
        <p>
          Voir la page <Link to="/confidentialite" className="underline">Confidentialité & données personnelles</Link>.
        </p>
      </section>
    </Page>
  );
}

export function Privacy() {
  const c = usePublicConfig();
  useSeo({
    title: "Confidentialité et données personnelles — AF Nettoyage",
    description: "Comment AF Nettoyage traite vos données personnelles (RGPD).",
    path: "/confidentialite",
  });
  return (
    <Page title="Confidentialité & données personnelles">
      <section>
        <h2>Responsable du traitement</h2>
        <p>
          {c.legal_name || "Adel Ferchichi"}, exploitant {c.trade_name}, Toulouse.{c.email ? ` Contact : ${c.email}.` : ""}
        </p>
      </section>
      <section>
        <h2>Données collectées et finalités</h2>
        <ul>
          <li>Formulaire de devis : identité, coordonnées, adresse du chantier, description et photos du chantier — pour étudier la demande et établir un devis (mesures précontractuelles, art. 6.1.b RGPD).</li>
          <li>Formulaire de contact : nom, coordonnées, message — pour vous répondre (intérêt légitime).</li>
          <li>Clients : données nécessaires à la réalisation des prestations, à la facturation et à la comptabilité (exécution du contrat, obligations légales).</li>
          <li>Une empreinte non réversible de l'adresse IP est conservée temporairement pour prévenir les envois abusifs (intérêt légitime).</li>
        </ul>
      </section>
      <section>
        <h2>Durées de conservation</h2>
        <ul>
          <li>Demandes sans suite : 3 ans après le dernier contact.</li>
          <li>Photos de chantier : supprimées au plus tard 2 ans après la dernière intervention, sauf litige.</li>
          <li>Devis et factures : 10 ans (obligations comptables et fiscales).</li>
        </ul>
      </section>
      <section>
        <h2>Destinataires et sous-traitants</h2>
        <p>
          Les données sont réservées à l'entreprise et ne sont jamais vendues ni cédées. Sous-traitants techniques : Netlify
          (hébergement du site), Supabase (base de données et stockage, UE). La recherche d'adresse et les fonds de carte
          proviennent du service public de la Géoplateforme (IGN) ; seule l'adresse saisie lui est transmise.
        </p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>
          Le site public n'utilise ni cookie publicitaire ni outil de mesure d'audience. Seul l'espace d'administration
          stocke un jeton de session technique, indispensable à la connexion.
        </p>
      </section>
      <section>
        <h2>Vos droits</h2>
        <p>
          Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité.
          Pour l'exercer, écrivez{c.email ? ` à ${c.email}` : " via la page Contact"}. Vous pouvez également introduire une
          réclamation auprès de la CNIL (cnil.fr).
        </p>
      </section>
    </Page>
  );
}

export function NotFound() {
  useSeo({ title: "Page introuvable — AF Nettoyage", description: "Cette page n'existe pas.", path: "/404" });
  return (
    <div className="container-page max-w-xl pt-24">
      <p className="eyebrow">Erreur 404</p>
      <h1 className="display mt-3 text-5xl">Cette page n'existe pas.</h1>
      <Link to="/" className="btn-primary mt-8">Retour à l'accueil</Link>
    </div>
  );
}

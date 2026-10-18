// Contenu éditorial des prestations (site public). Les tarifs ne sont jamais affichés publiquement.

export interface ServiceContent {
  slug: string;
  name: string;
  short: string;
  audience: "Particuliers" | "Professionnels" | "Particuliers & professionnels";
  intro: string;
  includes: string[];
  limits: string;
  /** Champs mis en avant dans le formulaire de devis. */
  asks: ("surface" | "quantity" | "frequency" | "access")[];
  quantityLabel?: string;
}

export const SERVICES: ServiceContent[] = [
  {
    slug: "vitrerie-particuliers",
    name: "Vitrerie pour particuliers",
    short: "Fenêtres, baies vitrées, vérandas",
    audience: "Particuliers",
    intro:
      "Des vitres nettes sans traces, à l'intérieur comme à l'extérieur, avec le nettoyage des cadres, rebords et rails.",
    includes: [
      "Fenêtres et portes-fenêtres",
      "Baies vitrées et coulissants",
      "Vérandas accessibles",
      "Cadres, encadrements et rebords",
      "Garde-corps vitrés et autres surfaces vitrées",
    ],
    limits:
      "Interventions réalisées depuis le sol, l'intérieur ou un escabeau. Les surfaces en hauteur ou difficiles d'accès sont étudiées au cas par cas.",
    asks: ["surface", "quantity", "frequency", "access"],
    quantityLabel: "Nombre approximatif de fenêtres ou baies",
  },
  {
    slug: "vitrines-commerces",
    name: "Vitrines et commerces",
    short: "Vitrines, devantures, portes vitrées",
    audience: "Professionnels",
    intro:
      "Une vitrine propre est la première impression de votre commerce. Passages ponctuels ou réguliers, à l'heure qui gêne le moins votre activité.",
    includes: [
      "Vitrines et devantures",
      "Portes d'entrée vitrées",
      "Cloisons et surfaces vitrées intérieures",
      "Passages réguliers (hebdomadaires, bimensuels, mensuels)",
    ],
    limits: "Vitrerie accessible depuis le sol ou un escabeau. Les hauteurs importantes nécessitent une étude préalable.",
    asks: ["surface", "frequency", "access"],
  },
  {
    slug: "bureaux",
    name: "Bureaux et locaux professionnels",
    short: "Entretien courant des espaces de travail",
    audience: "Professionnels",
    intro:
      "Un entretien régulier et discret de vos bureaux : sols, surfaces, postes de travail, poubelles et espaces communs.",
    includes: [
      "Dépoussiérage des surfaces et du mobilier",
      "Aspiration et lavage des sols",
      "Vidage des poubelles",
      "Désinfection des points de contact",
      "Cuisine et espace de pause",
    ],
    limits: "Fréquence et horaires définis avec vous après un diagnostic sur place.",
    asks: ["surface", "frequency", "access"],
  },
  {
    slug: "sanitaires",
    name: "Sanitaires",
    short: "WC, lavabos, robinetterie",
    audience: "Particuliers & professionnels",
    intro: "Un nettoyage minutieux et hygiénique des sanitaires, en particulier des surfaces les plus touchées.",
    includes: ["WC et urinoirs", "Lavabos et robinetterie", "Miroirs", "Sols", "Surfaces de contact (poignées, interrupteurs)"],
    limits: "Les dépôts de calcaire très anciens peuvent nécessiter plusieurs passages.",
    asks: ["quantity", "frequency", "access"],
    quantityLabel: "Nombre de sanitaires / points d'eau",
  },
  {
    slug: "parties-communes",
    name: "Parties communes et copropriétés",
    short: "Halls, escaliers, paliers",
    audience: "Professionnels",
    intro:
      "Pour les syndics, bailleurs et copropriétés : des parties communes entretenues selon un rythme fixe et vérifiable.",
    includes: ["Halls d'entrée", "Escaliers et paliers", "Portes vitrées d'entrée", "Boîtes aux lettres et rampes", "Ascenseur (cabine)"],
    limits: "Les sorties de containers et l'entretien des espaces verts ne sont pas proposés.",
    asks: ["surface", "frequency", "access"],
    quantityLabel: "Nombre d'étages / de cages d'escalier",
  },
  {
    slug: "apres-demenagement",
    name: "Nettoyage après déménagement",
    short: "Logements et locaux libérés",
    audience: "Particuliers & professionnels",
    intro:
      "Un logement ou un local rendu propre pour l'état des lieux de sortie, ou prêt à accueillir ses nouveaux occupants.",
    includes: [
      "Cuisine : façades, plans de travail, électroménager vide",
      "Salle de bains et WC",
      "Vitres intérieures",
      "Placards et rangements",
      "Sols de toutes les pièces",
    ],
    limits: "Le logement doit être vide. L'évacuation d'encombrants n'est pas comprise.",
    asks: ["surface", "access"],
  },
  {
    slug: "apres-travaux",
    name: "Remise en état après travaux légers",
    short: "Poussières, traces, finitions",
    audience: "Particuliers & professionnels",
    intro:
      "Après des travaux de peinture, de rénovation légère ou d'aménagement : dépoussiérage complet et nettoyage approfondi.",
    includes: [
      "Dépoussiérage des surfaces, plinthes et menuiseries",
      "Nettoyage des vitres et encadrements",
      "Retrait des traces légères (peinture fraîche, plâtre)",
      "Lavage des sols",
    ],
    limits: "Gros œuvre, gravats et décapage spécialisé exclus. Diagnostic recommandé avant devis.",
    asks: ["surface", "access"],
  },
];

export const FREQUENCIES = [
  { value: "ponctuelle", label: "Ponctuelle" },
  { value: "hebdomadaire", label: "Chaque semaine" },
  { value: "bimensuelle", label: "Toutes les deux semaines" },
  { value: "deux_fois_par_mois", label: "Deux fois par mois" },
  { value: "mensuelle", label: "Chaque mois" },
  { value: "autre", label: "Autre / à définir" },
];

export function serviceBySlug(slug: string | null | undefined): ServiceContent | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

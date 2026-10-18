# AF Nettoyage — plateforme web

Site vitrine public + logiciel de gestion (demandes, clients, diagnostics, devis, factures, règlements, planning, finances) pour **AF Nettoyage — Vitrerie & Entretien**, Toulouse.

- **Frontend** : React 18 + TypeScript + Vite + Tailwind, hébergé sur **Netlify**
- **Données / authentification / fichiers** : **Supabase** (PostgreSQL, Auth, Storage)
- **Fonction serveur** : `netlify/functions/submit-request.ts` (formulaires publics : anti-spam, quotas, URL d'envoi signées)
- **PDF** : générés dans le navigateur (`@react-pdf/renderer`) à partir de l'instantané figé du document
- **Cartographie / adresses** : Géoplateforme IGN (géocodage BAN + fond Plan IGN), sans clé

## Démarrage

```bash
npm install
cp .env.example .env.local   # renseigner l'URL et la clé anonyme Supabase
npm run dev                   # http://localhost:5173 — administration : /admin
```

Sans configuration Supabase, le site public fonctionne avec les valeurs par défaut (barème de déplacement, point de départ Empalot) ; l'administration affiche un message de configuration.

## Vérifications

```bash
npm run typecheck   # TypeScript strict (application + fonctions Netlify)
npm test            # calculs monétaires, tarification, déplacements, validation des formulaires
npm run test:db     # applique les migrations sur un PostgreSQL 16 éphémère et teste les règles métier
npm run build
```

`npm run test:db` nécessite les binaires PostgreSQL 16 (`PGBIN`, par défaut `/usr/lib/postgresql/16/bin`).

## Structure

| Dossier | Contenu |
| --- | --- |
| `src/public/` | Site public : accueil, prestations, zone & carte, demande de devis, contact, pages légales |
| `src/admin/` | Espace de gestion (mobile d'abord) |
| `src/lib/` | Calculs (`money.ts`, `pricing.ts`, `travel.ts`), géocodage, client Supabase, types |
| `src/pdf/` | Modèle et rendu PDF des devis, factures et avoirs |
| `supabase/migrations/` | Schéma, règles métier (triggers/fonctions), RLS et stockage |
| `supabase/seed.sql` | Catégories et prestations initiales (tarifs provisoires) |
| `supabase/tests/` | Tests SQL des règles métier |
| `netlify/` | Fonction serveur des formulaires publics et sa validation |
| `docs/` | [Déploiement](docs/DEPLOIEMENT.md), [architecture et règles métier](docs/ARCHITECTURE.md) |

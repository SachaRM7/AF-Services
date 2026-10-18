# Déploiement

## 1. Supabase

1. Créer un projet Supabase, **région UE (Paris `eu-west-3` recommandé)** pour le RGPD.
2. Appliquer les migrations dans l'ordre (SQL Editor, ou `supabase db push` avec la CLI) :
   - `supabase/migrations/20261017000001_schema.sql`
   - `supabase/migrations/20261017000002_logic.sql`
   - `supabase/migrations/20261017000003_security.sql` (RLS, droits, buckets `chantiers` et `documents`)
   - puis `supabase/seed.sql`.
3. **Authentication → Providers → Email** : désactiver « Allow new users to sign up ». Les comptes sont créés uniquement par invitation.
4. **Authentication → URL configuration** : *Site URL* = URL du site ; ajouter `https://<domaine>/admin/reinitialiser` aux *Redirect URLs*.
5. Créer les deux administrateurs :
   ```sql
   insert into public.admin_allowlist (email, full_name) values
     ('adel@…', 'Adel Ferchichi'),
     ('administration@…', 'Prénom Nom');
   ```
   Puis **Authentication → Users → Invite user** pour chaque adresse. Le profil administrateur est créé automatiquement à la création du compte (trigger `on_auth_user_created`). Une adresse absente de la liste obtient un compte sans aucun accès aux données.
   Pour retirer un accès : `update public.profiles set active = false where email = '…';`
6. Récupérer dans **Project settings → API** : l'URL, la clé `anon` (publique) et la clé `service_role` (secrète).

## 2. Netlify

1. Importer le dépôt (build `npm run build`, publication `dist` — déjà décrits dans `netlify.toml`).
2. Variables d'environnement (**Site settings → Environment variables**) :

| Variable | Portée | Rôle |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | build | URL Supabase (publique) |
| `VITE_SUPABASE_ANON_KEY` | build | clé anonyme (publique, protégée par RLS) |
| `VITE_SITE_URL` | build | URL canonique (SEO) |
| `SUPABASE_URL` | fonctions | URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | fonctions | **secrète** — jamais préfixée `VITE_` |
| `IP_HASH_SALT` | fonctions | chaîne aléatoire longue (pseudonymisation des IP) |
| `VITE_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | optionnel | Cloudflare Turnstile anti-robot |

3. Mettre à jour le domaine dans `public/sitemap.xml` une fois le domaine définitif connu.

## 3. Mise en service

1. Se connecter sur `/admin`, compléter **Paramètres** (coordonnées affichées, textes, tarifs, barème).
2. Utiliser le **mode préparation** pour les exercices : documents numérotés `SIM-…`, filigranés « SIMULATION ».
3. Une fois l'immatriculation obtenue : renseigner identité légale, SIREN/SIRET, adresse, **régime de TVA** (jamais présumé), IBAN, puis **Paramètres → Mode → Activer le mode exploitation**. La base refuse l'activation tant qu'une information obligatoire manque, et le retour en préparation est bloqué dès la première facture réelle.

## 4. Sauvegardes

- Plan Supabase Pro : sauvegardes quotidiennes automatiques (+ PITR en option).
- En complément (ou en plan gratuit) : export régulier `supabase db dump --data-only > sauvegarde-AAAA-MM-JJ.sql` conservé hors Supabase, et export des buckets `documents` (PDF émis) et `chantiers`.
- Les factures doivent être conservées 10 ans : ne jamais supprimer le projet sans export.

## 5. Données personnelles (RGPD)

- Photos et PDF sont dans des buckets **privés**, servis par URL signées d'une heure.
- Le formulaire public conserve une empreinte salée de l'IP (quota anti-abus), jamais l'IP.
- Durées de conservation indiquées sur `/confidentialite` : purger périodiquement les demandes sans suite de plus de 3 ans et les photos de plus de 2 ans (SQL Editor / Storage).

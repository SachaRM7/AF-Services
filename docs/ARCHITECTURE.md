# Architecture et règles métier

## Principe : la base de données est l'autorité

Toutes les règles sensibles sont appliquées dans PostgreSQL (`supabase/migrations/…_logic.sql`), pas seulement dans l'interface :

| Règle | Mise en œuvre |
| --- | --- |
| Accès réservé aux deux administrateurs | RLS `is_admin()` sur toutes les tables ; fonctions `security definer` qui appellent `assert_admin()` ; aucun accès anonyme direct |
| Totaux exacts | `recalc_document()` recalcule lignes et totaux à chaque modification ; les totaux envoyés par le client sont ignorés |
| Minimum de prestation | `max(minimum, prestations + remises)` appliqué au total des prestations, hors déplacement, si au moins une prestation |
| Frais de déplacement | distance à vol d'oiseau (haversine) depuis le point configuré, tranche aux bornes incluses ; ligne distincte ; dérogation avec motif |
| Numérotation | `next_document_number()` : séquence par type/année/mode, sans trou ; `D-`, `F-`, `AV-` ; préfixe `SIM-` en préparation |
| Documents émis figés | triggers `quotes_guard` / `invoices_guard` : contenu et lignes non modifiables, suppression interdite ; instantané `snapshot` (vendeur, client, chantier, lignes, totaux) |
| Corrections de facture | uniquement par avoir (`credit_note_for`), total des avoirs ≤ facture |
| Statut de paiement | dérivé des règlements et avoirs, jamais saisi ; règlement > reste dû refusé |
| Versions de devis | `copy_quote(id, true)` : nouvelle version `…-V2`, les précédentes passent « remplacé » |
| Mode exploitation | `set_operating_mode()` vérifie `legal_readiness()` ; changement direct de la colonne refusé |
| Traçabilité | `audit_trigger` journalise créations, modifications (champs modifiés) et suppressions avec l'auteur |

## Montants

Centimes entiers (`bigint`), quantités `numeric(12,3)`, pourcentages en points de base. Arrondi « demi loin de zéro » identique en SQL (`round(numeric)`) et en TypeScript (`divRound` sur `BigInt`). `src/lib/pricing.ts` est le miroir de `recalc_document` pour l'aperçu instantané ; les mêmes cas sont testés des deux côtés.

Calcul : `ligne = round(round(qté × PU) × (1 − remise))`, `ajustement % = round(Σ prestations × %)`, `HT = prestations + ajustements + complément minimum + déplacement`, `TVA = round(HT × taux)` (0 en franchise).

## Parcours

```
Demande publique ──convert_request──▶ Client + adresse
      │                                   │
      └─diagnostic_from_request──▶ Diagnostic ──new_quote──▶ Devis (brouillon)
                                                           │ issue_quote
                                                           ▼
                                           Devis envoyé ─▶ accepté ─invoice_from_quote─▶ Facture (brouillon)
                                                           │                                │ issue_invoice
                                     Intervention(s) / récurrence                          ▼
                                     terminée ─invoice_from_intervention─▶         Facture émise ─▶ règlements / avoir
```

## Facturation électronique

Les factures conservent les données requises par la réforme (SIREN du client, adresse de livraison = chantier, catégorie d'opération, option TVA sur les débits) et un suivi `einvoice_status` / `einvoice_reference`. L'émission via une plateforme agréée reste à brancher (export structuré Factur-X/UBL depuis `snapshot`) ; le PDF seul ne constitue pas une facture électronique.

## Formulaires publics

`netlify/functions/submit-request.ts` : validation stricte (`netlify/lib/validate.ts`), pot de miel, délai minimal de saisie, quota par IP pseudonymisée et global, Turnstile optionnel, insertion avec la clé service, puis URL d'envoi signées vers le bucket privé `chantiers` (5 photos, 10 Mo).

-- AF Nettoyage — sécurité : RLS, droits d'exécution, stockage

-- RLS activée partout. Aucun accès anonyme direct aux données métier :
-- les formulaires publics passent par une fonction Netlify (clé service, anti-abus).
do $$
declare t text;
begin
  foreach t in array array['admin_allowlist','profiles','company_settings','travel_bands','service_categories','services',
                           'clients','sites','requests','diagnostics','diagnostic_items','document_sequences','quotes',
                           'quote_lines','invoices','invoice_lines','payments','recurrences','interventions','expenses',
                           'attachments','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Accès complet pour les administrateurs actifs sur les tables métier.
do $$
declare t text;
begin
  foreach t in array array['travel_bands','service_categories','services','clients','sites','requests','diagnostics',
                           'diagnostic_items','quotes','quote_lines','invoices','invoice_lines','payments','recurrences',
                           'interventions','expenses','attachments'] loop
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

create policy admin_read on public.company_settings for select to authenticated using (public.is_admin());
create policy admin_update on public.company_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy admin_read on public.profiles for select to authenticated using (public.is_admin());
create policy self_update on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_admin()) with check (id = auth.uid());

create policy admin_read on public.admin_allowlist for select to authenticated using (public.is_admin());
create policy admin_read on public.audit_log for select to authenticated using (public.is_admin());
-- document_sequences : aucune policy, accessible uniquement via les fonctions d'émission.

-- Lecture publique limitée : catégories publiées et tranches de déplacement (affichées sur le site).
create policy public_read on public.service_categories for select to anon using (is_public);
create policy public_read on public.travel_bands for select to anon using (true);

-- Un administrateur ne peut pas modifier son propre statut actif ni son e-mail via l'API.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Le journal est en lecture seule pour tous les rôles clients.
revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke all on public.document_sequences from anon, authenticated;

-- Droits d'exécution des fonctions
-- Supabase accorde par défaut EXECUTE à anon/authenticated sur toute nouvelle fonction : on retire tout,
-- puis on n'ouvre que les points d'entrée prévus (qui vérifient eux-mêmes le rôle administrateur).
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.paris_today() to authenticated;
grant execute on function public.get_public_config() to anon, authenticated;
grant execute on function public.travel_fee_for_km(numeric) to anon, authenticated;
grant execute on function public.haversine_km(numeric, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.legal_readiness() to authenticated;
grant execute on function public.set_operating_mode(text) to authenticated;
grant execute on function public.issue_quote(uuid) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.new_quote(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.copy_quote(uuid, boolean) to authenticated;
grant execute on function public.new_invoice(uuid, uuid) to authenticated;
grant execute on function public.invoice_from_quote(uuid, date) to authenticated;
grant execute on function public.invoice_from_intervention(uuid) to authenticated;
grant execute on function public.credit_note_for(uuid) to authenticated;
grant execute on function public.convert_request(uuid) to authenticated;
grant execute on function public.diagnostic_from_request(uuid) to authenticated;
grant execute on function public.generate_recurrence(uuid, date) to authenticated;
grant execute on function public.distance_from_base_km(numeric, numeric) to authenticated;
grant execute on function public.document_snapshot(text, uuid) to authenticated;
-- recalc_document, next_document_number, seller_snapshot, assert_admin : internes (appelées par les fonctions ci-dessus).
-- Les fonctions de trigger ne sont pas appelables directement.

-- ---------------------------------------------------------------------------
-- Stockage : deux buckets privés
--   chantiers : photos de demandes, diagnostics, interventions
--   documents : PDF des devis et factures émis (archivage)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chantiers', 'chantiers', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('documents', 'documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "admin read files" on storage.objects for select to authenticated
  using (bucket_id in ('chantiers', 'documents') and public.is_admin());
create policy "admin insert files" on storage.objects for insert to authenticated
  with check (bucket_id in ('chantiers', 'documents') and public.is_admin());
create policy "admin update files" on storage.objects for update to authenticated
  using (bucket_id = 'chantiers' and public.is_admin());
-- Les PDF archivés ne sont jamais supprimés ni remplacés ; seules les photos peuvent l'être.
create policy "admin delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'chantiers' and public.is_admin());

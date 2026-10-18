import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// La clé anonyme est publique par conception : toutes les données sont protégées par les politiques RLS.
export const supabase: SupabaseClient = createClient(url ?? "http://localhost:54321", anonKey ?? "public-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Exécute une requête Supabase et lève une erreur lisible en cas d'échec. Le résultat est typé par l'appelant. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function must(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<any> {
  const { data, error } = await p;
  if (error) throw new Error(translateError(error.message));
  return data;
}

export function translateError(message: string): string {
  if (/row-level security/i.test(message)) return "Action non autorisée.";
  if (/JWT expired/i.test(message)) return "Session expirée : reconnectez-vous.";
  if (/Failed to fetch|NetworkError/i.test(message)) return "Connexion impossible. Vérifiez votre réseau.";
  if (/duplicate key/i.test(message)) return "Cet élément existe déjà.";
  if (/violates foreign key/i.test(message)) return "Élément lié à d'autres données : suppression impossible.";
  return message;
}

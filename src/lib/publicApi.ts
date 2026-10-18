// Accès minimal à Supabase pour le site public, sans charger le SDK complet (performance mobile).
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const publicApiConfigured = Boolean(url && key);

export async function publicRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`RPC ${fn} : ${res.status}`);
  return (await res.json()) as T;
}

export async function publicSelect<T>(table: string, query: string): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: { apikey: key!, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${table} : ${res.status}`);
  return (await res.json()) as T;
}

/** Envoi d'un fichier vers une URL d'envoi signée délivrée par la fonction serveur. */
export async function uploadToSignedUrl(bucket: string, path: string, token: string, file: File): Promise<boolean> {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const res = await fetch(`${url}/storage/v1/object/upload/sign/${bucket}/${path}?token=${encodeURIComponent(token)}`, {
    method: "PUT",
    headers: { apikey: key!, "x-upsert": "false" },
    body,
  });
  return res.ok;
}

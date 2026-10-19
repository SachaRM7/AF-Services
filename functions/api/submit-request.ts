interface Env { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; IP_HASH_SALT: string; TURNSTILE_SECRET_KEY?: string }
// Réception des formulaires publics (devis et contact).
// Seul point d'écriture anonyme : validation, anti-abus, insertion avec la clé service (jamais exposée au navigateur),
// puis délivrance d'URL d'envoi signées pour les photos (bucket privé).
import { createClient } from "@supabase/supabase-js";

import { validateSubmission, type CleanSubmission } from "../../netlify/lib/validate";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const PER_IP_PER_HOUR = 5;
const GLOBAL_PER_HOUR = 60;

async function verifyTurnstile(token: string | undefined, ip: string, env: Env): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = (await res.json()) as { success?: boolean }
  return Boolean(data.success);
}

export async function onRequestPost({ request: req, env }: { request: Request; env: Env }): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { error: "Service momentanément indisponible." });

  const raw = await req.text();
  if (raw.length > 20_000) return json(413, { error: "Demande trop volumineuse." });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "Requête invalide." });
  }

  const result = validateSubmission(body);
  // Pot de miel / envoi trop rapide : on répond « OK » sans rien enregistrer pour ne pas renseigner les robots.
  if (result.kind === "bot") return json(200, { id: crypto.randomUUID(), uploads: [] });
  if (result.kind === "invalid") return json(422, { error: result.error });
  const data: CleanSubmission = result.data;

  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await verifyTurnstile(data.turnstile_token, ip, env))) return json(400, { error: "Vérification anti-robot échouée." });

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.IP_HASH_SALT ?? ""}:${ip}`));
  const ipHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 3600_000).toISOString();

  const [{ count: perIp }, { count: global }] = await Promise.all([
    db.from("requests").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since),
    db.from("requests").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  if ((perIp ?? 0) >= PER_IP_PER_HOUR || (global ?? 0) >= GLOBAL_PER_HOUR) {
    return json(429, { error: "Trop de demandes envoyées. Merci de réessayer plus tard ou de nous contacter directement." });
  }

  const { photos, turnstile_token: _t, ...row } = data;
  const { data: inserted, error } = await db
    .from("requests")
    .insert({ ...row, ip_hash: ipHash, consent_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("insert request failed", error);
    return json(500, { error: "L'enregistrement a échoué. Merci de réessayer." });
  }

  const uploads: { path: string; token: string }[] = [];
  for (const [i, p] of photos.entries()) {
    const ext = p.type === "image/png" ? "png" : p.type === "image/webp" ? "webp" : p.type.startsWith("image/hei") ? "heic" : "jpg";
    const path = `demandes/${inserted.id}/${i + 1}-${randomUUID().slice(0, 8)}.${ext}`;
    const { data: signed, error: signErr } = await db.storage.from("chantiers").createSignedUploadUrl(path);
    if (signErr || !signed) continue;
    await db.from("attachments").insert({
      bucket: "chantiers",
      storage_path: path,
      file_name: p.name.slice(0, 200),
      mime_type: p.type,
      size_bytes: p.size,
      phase: "avant",
      request_id: inserted.id,
    });
    uploads.push({ path, token: signed.token });
  }

  return json(201, { id: inserted.id, uploads });
};

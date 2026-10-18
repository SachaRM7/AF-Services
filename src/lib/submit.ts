import { uploadToSignedUrl } from "./publicApi";

export interface PublicSubmission {
  kind: "devis" | "contact";
  customer_type: "particulier" | "professionnel";
  first_name: string;
  last_name: string;
  company_name?: string;
  email: string;
  phone?: string;
  address_line1?: string;
  postal_code?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  category_slugs?: string[];
  surface_m2?: string;
  quantity?: string;
  frequency?: string;
  access_info?: string;
  preferred_dates?: string;
  message?: string;
  consent: boolean;
  photos?: { name: string; type: string; size: number }[];
  // anti-abus
  website?: string; // pot de miel : doit rester vide
  elapsed_ms: number;
  turnstile_token?: string;
}

export interface SubmissionResult {
  id: string;
  uploads: { path: string; token: string }[];
}

export async function submitPublicForm(payload: PublicSubmission): Promise<SubmissionResult> {
  const res = await fetch("/.netlify/functions/submit-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<SubmissionResult> & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "L'envoi a échoué. Merci de réessayer dans quelques instants.");
  return { id: json.id as string, uploads: json.uploads ?? [] };
}

/** Réduit les photos trop lourdes (côté navigateur) avant envoi. */
export async function shrinkImage(file: File, maxSide = 2000, quality = 0.82): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadPhotos(files: File[], uploads: SubmissionResult["uploads"]): Promise<number> {
  let failed = 0;
  await Promise.all(
    uploads.map(async (u, i) => {
      const ok = await uploadToSignedUrl("chantiers", u.path, u.token, files[i]).catch(() => false);
      if (!ok) failed++;
    }),
  );
  return failed;
}

import { useEffect, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import type { Attachment } from "../lib/types";
import { shrinkImage } from "../lib/submit";
import { useAction, useConfirm } from "./ui";
import { cx } from "../lib/format";

type Owner = { request_id?: string; diagnostic_id?: string; intervention_id?: string; client_id?: string };

const PHASES = { avant: "Avant", apres: "Après", autre: "Autre" } as const;

/** Photos de chantier stockées dans un bucket privé, affichées via des URL signées temporaires. */
export function Attachments({ owner, extraOwners = [], canUpload = true, defaultPhase = "avant" }: { owner: Owner; extraOwners?: Owner[]; canUpload?: boolean; defaultPhase?: keyof typeof PHASES }) {
  const [items, setItems] = useState<(Attachment & { url?: string })[]>([]);
  const [phase, setPhase] = useState<keyof typeof PHASES>(defaultPhase);
  const [uploading, setUploading] = useState(false);
  const { run } = useAction();
  const confirm = useConfirm();
  const key = JSON.stringify([owner, extraOwners]);

  async function load() {
    const owners = [owner, ...extraOwners].filter((o) => Object.values(o).some(Boolean));
    const ors = owners.flatMap((o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}.eq.${v}`));
    if (!ors.length) return setItems([]);
    const rows = (await must(supabase.from("attachments").select("*").or(ors.join(",")).order("created_at"))) as Attachment[];
    const { data: signed } = rows.length
      ? await supabase.storage.from("chantiers").createSignedUrls(rows.map((r) => r.storage_path), 3600)
      : { data: [] };
    setItems(rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? undefined })));
  }

  useEffect(() => {
    load().catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    await run(async () => {
      for (const raw of Array.from(files)) {
        const file = await shrinkImage(raw);
        const folder = owner.diagnostic_id ? `diagnostics/${owner.diagnostic_id}` : owner.intervention_id ? `interventions/${owner.intervention_id}` : owner.request_id ? `demandes/${owner.request_id}` : `clients/${owner.client_id}`;
        const path = `${folder}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
        const { error } = await supabase.storage.from("chantiers").upload(path, file, { contentType: file.type });
        if (error) throw new Error(`Envoi impossible : ${error.message}`);
        await must(supabase.from("attachments").insert({ ...owner, bucket: "chantiers", storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, phase }));
      }
      await load();
    }, "Photo(s) ajoutée(s)");
    setUploading(false);
  }

  async function remove(a: Attachment) {
    if (!(await confirm({ title: "Supprimer cette photo ?", danger: true, confirmLabel: "Supprimer" }))) return;
    await run(async () => {
      await supabase.storage.from("chantiers").remove([a.storage_path]);
      await must(supabase.from("attachments").delete().eq("id", a.id));
      setItems((xs) => xs.filter((x) => x.id !== a.id));
    });
  }

  return (
    <div>
      {canUpload && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className="input input-sm w-auto" value={phase} onChange={(e) => setPhase(e.target.value as keyof typeof PHASES)} aria-label="Moment de la photo">
            {Object.entries(PHASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className={cx("btn-secondary btn-sm cursor-pointer", uploading && "opacity-50")}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Prendre / ajouter des photos
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={uploading} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">Aucune photo.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {items.map((a) => (
            <figure key={a.id} className="group relative aspect-square overflow-hidden rounded-lg border border-stone/40 bg-paper-deep">
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.file_name} loading="lazy" className="h-full w-full object-cover" /></a>
              ) : (
                <span className="flex h-full items-center justify-center p-2 text-center text-xs text-ink-muted">Fichier non transmis</span>
              )}
              <figcaption className="absolute bottom-1 left-1 rounded bg-ink/75 px-1.5 text-[0.65rem] font-semibold text-paper">{PHASES[a.phase]}</figcaption>
              {canUpload && (
                <button onClick={() => remove(a)} className="absolute right-1 top-1 rounded bg-white/90 p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Supprimer la photo">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

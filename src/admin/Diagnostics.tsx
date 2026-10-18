import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, FileSignature, Plus, Save, Trash2 } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { cx, formatDate, formatKm, minutesLabel, todayIso } from "../lib/format";
import { centsToInput, formatEuros, parseEuros } from "../lib/money";
import { computeTotals, UNIT_LABELS, type Unit } from "../lib/pricing";
import { FREQUENCIES } from "../lib/content";
import { travelFeeForKm } from "../lib/travel";
import type { Client, Diagnostic, DiagnosticItem, Site } from "../lib/types";
import { useAsync, useUnsavedWarning } from "./hooks";
import { Badge, Card, Empty, ErrorBox, Field, Loading, PageHeader, Tabs, useAction, useConfirm } from "./ui";
import { ClientPicker, SiteSelect } from "./pickers";
import { Attachments } from "./Attachments";
import { useSettings } from "./settingsStore";

// --- Champs spécifiques par type de prestation -------------------------------

type SpecField = { key: string; label: string; type: "number" | "text" | "select" | "bool"; options?: string[] };

const SPEC_FIELDS: Record<string, SpecField[]> = {
  vitrerie: [
    { key: "fenetres", label: "Fenêtres", type: "number" },
    { key: "baies", label: "Baies / portes-fenêtres", type: "number" },
    { key: "vitrage", label: "Type de vitrage", type: "select", options: ["Simple", "Double", "Triple", "Petits carreaux", "Mixte"] },
    { key: "faces", label: "Faces", type: "select", options: ["Intérieur + extérieur", "Extérieur seul", "Intérieur seul"] },
    { key: "hauteur_max_m", label: "Hauteur max. (m)", type: "number" },
    { key: "cadres", label: "Cadres et rebords inclus", type: "bool" },
    { key: "volets", label: "Volets / stores à nettoyer", type: "bool" },
  ],
  surfaces: [
    { key: "surface_sol_m2", label: "Surface au sol (m²)", type: "number" },
    { key: "pieces", label: "Nombre de pièces", type: "number" },
    { key: "sol", label: "Type de sol", type: "select", options: ["Carrelage", "Parquet", "Stratifié", "PVC / lino", "Moquette", "Béton", "Mixte"] },
    { key: "postes", label: "Postes de travail", type: "number" },
    { key: "poubelles", label: "Poubelles", type: "number" },
    { key: "etages", label: "Étages / paliers", type: "number" },
  ],
  sanitaires: [
    { key: "wc", label: "WC", type: "number" },
    { key: "urinoirs", label: "Urinoirs", type: "number" },
    { key: "lavabos", label: "Lavabos", type: "number" },
    { key: "douches", label: "Douches", type: "number" },
    { key: "calcaire", label: "Calcaire", type: "select", options: ["Faible", "Moyen", "Important"] },
  ],
  generique: [],
};

const DIRT = ["Léger", "Normal", "Important", "Très important"];

interface ItemDraft extends Omit<DiagnosticItem, "id" | "diagnostic_id" | "quantity"> {
  key: string;
  quantity: string;
}

const emptyDiag = (): Omit<Diagnostic, "id" | "created_at" | "updated_at"> => ({
  status: "brouillon", client_id: null, site_id: null, request_id: null, visit_date: todayIso(), frequency: "ponctuelle",
  general_state: "", dirt_level: 2, accessibility: "", difficulties: "", equipment_needed: "", parking_access: "",
  observations: "", material_cost_cents: 0, proposed_price_cents: null,
});

export function DiagnosticList() {
  const [tab, setTab] = useState<"brouillon" | "finalise" | "tous">("brouillon");
  const { data, error, loading, reload } = useAsync(async () => {
    let q = supabase.from("diagnostics").select("*, clients(display_name), sites(city)").order("updated_at", { ascending: false }).limit(200);
    if (tab !== "tous") q = q.eq("status", tab);
    return (await must(q)) as (Diagnostic & { clients: { display_name: string } | null; sites: { city: string } | null })[];
  }, [tab]);
  return (
    <>
      <PageHeader title="Diagnostics" subtitle="Visites de chantier et estimations." actions={<Link to="/admin/diagnostics/nouveau" className="btn-primary btn-sm"><Plus className="h-4 w-4" /> Nouveau</Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "brouillon", label: "Brouillons" }, { value: "finalise", label: "Finalisés" }, { value: "tous", label: "Tous" }]} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <Loading />}
      {data && data.length === 0 && <Empty title="Aucun diagnostic" />}
      <ul className="space-y-2">
        {data?.map((d) => (
          <li key={d.id}>
            <Link to={`/admin/diagnostics/${d.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-ink">
              <span>
                <span className="block font-semibold">{d.clients?.display_name ?? "Client à définir"}</span>
                <span className="text-xs text-ink-muted">Visite {formatDate(d.visit_date)}{d.sites?.city ? ` · ${d.sites.city}` : ""}</span>
              </span>
              <Badge tone={d.status === "brouillon" ? "warn" : "ok"}>{d.status === "brouillon" ? "Brouillon" : "Finalisé"}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function DiagnosticEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nouveau";
  const [params] = useSearchParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { settings, bands, services, categories } = useSettings();
  const { busy, run } = useAction();
  const localKey = `af-diag-${isNew ? "new" : id}`;

  const [diag, setDiag] = useState(emptyDiag());
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [restorable, setRestorable] = useState<string | null>(null);

  const { error, loading, reload } = useAsync(async () => {
    if (isNew) {
      const d = { ...emptyDiag(), client_id: params.get("client") };
      setDiag(d);
      setItems([]);
      setSavedSnapshot(JSON.stringify({ d, items: [] }));
      return null;
    }
    const [d, its] = await Promise.all([
      must(supabase.from("diagnostics").select("*").eq("id", id).single()),
      must(supabase.from("diagnostic_items").select("*").eq("diagnostic_id", id).order("position")),
    ]);
    const { id: _id, created_at: _c, updated_at, ...rest } = d as Diagnostic;
    const drafts = (its as DiagnosticItem[]).map(({ id: iid, diagnostic_id: _d, ...it }) => ({ ...it, key: iid, quantity: String(it.quantity).replace(".", ","), unit_price_cents: Number(it.unit_price_cents) }));
    setDiag(rest);
    setItems(drafts);
    setSavedSnapshot(JSON.stringify({ d: rest, items: drafts }));
    if ((rest as Diagnostic).site_id) {
      const { data: s } = await supabase.from("sites").select("*").eq("id", (rest as Diagnostic).site_id).single();
      setSite(s as Site);
    }
    try {
      const local = localStorage.getItem(localKey);
      if (local && JSON.parse(local).at > new Date(updated_at).getTime()) setRestorable(local);
    } catch { /* stockage indisponible */ }
    return null;
  }, [id]);

  const current = JSON.stringify({ d: diag, items });
  const dirty = savedSnapshot !== "" && current !== savedSnapshot;
  useUnsavedWarning(dirty);

  // Sauvegarde locale de secours (réseau instable sur le terrain)
  useEffect(() => {
    if (!dirty) return;
    try { localStorage.setItem(localKey, JSON.stringify({ at: Date.now(), d: diag, items })); } catch { /* ignore */ }
  }, [current, dirty, localKey, diag, items]);

  const km = site?.distance_km != null ? Number(site.distance_km) : null;
  const travel = travelFeeForKm(km, bands);
  const totals = useMemo(
    () => computeTotals(items.map((i) => ({ kind: "service", quantity: i.quantity.replace(",", ".") || "0", unit_price_cents: i.unit_price_cents })), {
      apply_minimum: true, minimum_cents: Number(settings?.minimum_charge_cents ?? 4000), travel_fee_cents: travel, vat_rate_bps: 0, vat_exempt: true,
    }),
    [items, settings, travel],
  );
  const minutes = items.reduce((a, i) => a + (Number(i.estimated_minutes) || 0), 0);
  const proposed = diag.proposed_price_cents ?? totals.totalHt;
  const hourly = minutes > 0 ? Math.round(((proposed - travel - Number(diag.material_cost_cents)) * 60) / minutes) : null;

  const special = items.some((i) => {
    const sv = services.find((s) => s.id === i.service_id);
    return sv?.requires_special_equipment || Number(i.specifics.hauteur_max_m ?? 0) > 3;
  });

  function addItem(serviceId: string) {
    const sv = services.find((s) => s.id === serviceId);
    if (!sv) return;
    setItems((xs) => [...xs, { key: crypto.randomUUID(), position: xs.length + 1, service_id: sv.id, label: sv.name, quantity: "", unit: sv.unit, unit_price_cents: sv.unit_price_cents, estimated_minutes: sv.unit === "heure" ? 60 : 0, specifics: {}, notes: "" }]);
  }
  const updItem = (key: string, patch: Partial<ItemDraft>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function save(status?: Diagnostic["status"]): Promise<string | undefined> {
    return run(async () => {
      const payload = { ...diag, status: status ?? diag.status };
      let diagId = isNew ? undefined : id;
      if (diagId) await must(supabase.from("diagnostics").update(payload).eq("id", diagId));
      else diagId = ((await must(supabase.from("diagnostics").insert(payload).select("id").single())) as { id: string }).id;
      await must(supabase.from("diagnostic_items").delete().eq("diagnostic_id", diagId));
      if (items.length) {
        await must(supabase.from("diagnostic_items").insert(items.map((it, i) => ({
          diagnostic_id: diagId, position: i + 1, service_id: it.service_id, label: it.label, quantity: it.quantity.replace(",", ".") || "0",
          unit: it.unit, unit_price_cents: it.unit_price_cents, estimated_minutes: it.estimated_minutes, specifics: it.specifics, notes: it.notes,
        }))));
      }
      try { localStorage.removeItem(localKey); localStorage.removeItem("af-diag-new"); } catch { /* ignore */ }
      setDiag(payload);
      setSavedSnapshot(JSON.stringify({ d: payload, items }));
      if (isNew) nav(`/admin/diagnostics/${diagId}`, { replace: true });
      return diagId;
    }, status === "finalise" ? "Diagnostic finalisé" : "Brouillon enregistré");
  }

  async function toQuote() {
    if (!diag.client_id) return;
    const diagId = dirty || isNew ? await save() : id;
    if (!diagId) return;
    const q = await run(() => must(supabase.rpc("new_quote", { p_client: diag.client_id, p_site: diag.site_id, p_request: diag.request_id, p_diagnostic: diagId })));
    if (q) nav(`/admin/devis/${q}`);
  }

  async function remove() {
    if (!(await confirm({ title: "Supprimer ce diagnostic ?", danger: true, confirmLabel: "Supprimer" }))) return;
    if (await run(() => must(supabase.from("diagnostics").delete().eq("id", id)), "Diagnostic supprimé") !== undefined) nav("/admin/diagnostics");
  }

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !isNew) return <Loading />;

  const set = <K extends keyof typeof diag>(k: K, v: (typeof diag)[K]) => setDiag((d) => ({ ...d, [k]: v }));
  const catOf = (serviceId: string | null) => categories.find((c) => c.id === services.find((s) => s.id === serviceId)?.category_id);

  return (
    <>
      <PageHeader
        back="/admin/diagnostics"
        title={isNew ? "Nouveau diagnostic" : "Diagnostic de chantier"}
        subtitle={<Badge tone={diag.status === "brouillon" ? "warn" : "ok"}>{diag.status === "brouillon" ? "Brouillon" : "Finalisé"}</Badge>}
        actions={!isNew && <button className="btn-ghost btn-sm" onClick={remove}><Trash2 className="h-4 w-4" /></button>}
      />

      {restorable && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Des modifications locales plus récentes n'ont pas été enregistrées.
          <button className="font-semibold underline" onClick={() => { const l = JSON.parse(restorable); setDiag(l.d); setItems(l.items); setRestorable(null); }}>Restaurer</button>
          <button className="underline" onClick={() => { localStorage.removeItem(localKey); setRestorable(null); }}>Ignorer</button>
        </div>
      )}

      <div className="space-y-5">
        <Card title="Client et intervention">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client">
              <ClientPicker value={diag.client_id} onChange={(c: Client | null) => { set("client_id", c?.id ?? null); set("site_id", null); setSite(null); }} />
            </Field>
            <Field label="Adresse du chantier" hint={km != null ? `${formatKm(km)} · déplacement ${formatEuros(travel)} HT` : undefined}>
              <SiteSelect clientId={diag.client_id} value={diag.site_id} onChange={(s) => { set("site_id", s?.id ?? null); setSite(s); }} />
            </Field>
            <Field label="Date de visite"><input type="date" className="input" value={diag.visit_date ?? ""} onChange={(e) => set("visit_date", e.target.value || null)} /></Field>
            <Field label="Fréquence souhaitée">
              <select className="input" value={diag.frequency} onChange={(e) => set("frequency", e.target.value)}>
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>
          </div>
          {settings && km != null && km > settings.manual_review_km && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Chantier éloigné : à valider manuellement.</p>
          )}
        </Card>

        <Card title="Prestations constatées">
          <div className="space-y-4">
            {items.map((it) => {
              const cat = catOf(it.service_id);
              const sv = services.find((s) => s.id === it.service_id);
              return (
                <div key={it.key} className="rounded-xl border border-stone/40 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <input className="input font-semibold" value={it.label} onChange={(e) => updItem(it.key, { label: e.target.value })} />
                    <button className="btn-ghost btn-sm" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} aria-label="Retirer"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {sv?.requires_special_equipment && (
                    <p className="mt-2 flex gap-2 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Matériel spécialisé requis : {sv.constraints_text || "faisabilité à confirmer"}</p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label={`Quantité (${UNIT_LABELS[it.unit].short})`}>
                      <input inputMode="decimal" className="input" value={it.quantity} onChange={(e) => updItem(it.key, { quantity: e.target.value })} />
                    </Field>
                    <Field label="Unité">
                      <select className="input" value={it.unit} onChange={(e) => updItem(it.key, { unit: e.target.value as Unit })}>
                        {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.long}</option>)}
                      </select>
                    </Field>
                    <Field label="Prix unitaire HT">
                      <input inputMode="decimal" className="input" defaultValue={centsToInput(it.unit_price_cents)} onBlur={(e) => { try { updItem(it.key, { unit_price_cents: parseEuros(e.target.value) }); } catch { e.target.value = centsToInput(it.unit_price_cents); } }} />
                    </Field>
                    <Field label="Temps estimé (min)">
                      <input inputMode="numeric" className="input" value={it.estimated_minutes || ""} onChange={(e) => updItem(it.key, { estimated_minutes: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
                    </Field>
                  </div>
                  {cat && SPEC_FIELDS[cat.form_kind]?.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-stone/30 pt-3 sm:grid-cols-4">
                      {SPEC_FIELDS[cat.form_kind].map((f) => (
                        <Field key={f.key} label={f.label}>
                          {f.type === "select" ? (
                            <select className="input input-sm" value={String(it.specifics[f.key] ?? "")} onChange={(e) => updItem(it.key, { specifics: { ...it.specifics, [f.key]: e.target.value } })}>
                              <option value="">—</option>
                              {f.options?.map((o) => <option key={o}>{o}</option>)}
                            </select>
                          ) : f.type === "bool" ? (
                            <input type="checkbox" className="h-5 w-5 accent-ink" checked={Boolean(it.specifics[f.key])} onChange={(e) => updItem(it.key, { specifics: { ...it.specifics, [f.key]: e.target.checked } })} />
                          ) : (
                            <input inputMode={f.type === "number" ? "decimal" : "text"} className="input input-sm" value={String(it.specifics[f.key] ?? "")} onChange={(e) => updItem(it.key, { specifics: { ...it.specifics, [f.key]: e.target.value } })} />
                          )}
                        </Field>
                      ))}
                    </div>
                  )}
                  <input className="input input-sm mt-3" placeholder="Remarque sur cette prestation" value={it.notes} onChange={(e) => updItem(it.key, { notes: e.target.value })} />
                </div>
              );
            })}
            <select className="input" value="" onChange={(e) => e.target.value && addItem(e.target.value)}>
              <option value="">+ Ajouter une prestation…</option>
              {categories.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {services.filter((s) => s.category_id === c.id && (s.active || s.requires_special_equipment)).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{!s.active ? " (indisponible)" : ""}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </Card>

        <Card title="État et accès">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Niveau de saleté" className="sm:col-span-2">
              <div className="grid grid-cols-4 gap-1 rounded-xl border border-stone/50 bg-white p-1">
                {DIRT.map((d, i) => (
                  <button key={d} type="button" onClick={() => set("dirt_level", i + 1)} className={cx("rounded-lg px-1 py-2 text-xs font-semibold sm:text-sm", diag.dirt_level === i + 1 ? "bg-ink text-paper" : "text-ink-muted")}>{d}</button>
                ))}
              </div>
            </Field>
            <Field label="État général"><textarea rows={2} className="input" value={diag.general_state} onChange={(e) => set("general_state", e.target.value)} /></Field>
            <Field label="Accessibilité"><textarea rows={2} className="input" value={diag.accessibility} onChange={(e) => set("accessibility", e.target.value)} placeholder="Étage, ascenseur, hauteur…" /></Field>
            <Field label="Difficultés particulières"><textarea rows={2} className="input" value={diag.difficulties} onChange={(e) => set("difficulties", e.target.value)} /></Field>
            <Field label="Matériel nécessaire"><textarea rows={2} className="input" value={diag.equipment_needed} onChange={(e) => set("equipment_needed", e.target.value)} /></Field>
            <Field label="Stationnement / accès véhicule" className="sm:col-span-2"><input className="input" value={diag.parking_access} onChange={(e) => set("parking_access", e.target.value)} /></Field>
          </div>
          {special && (
            <p className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /> Ce chantier comporte des éléments nécessitant du matériel spécialisé (hauteur &gt; 3 m ou prestation marquée). Vérifiez la faisabilité avant de proposer un devis.</p>
          )}
        </Card>

        <Card title="Photos avant intervention">
          {isNew ? <p className="text-sm text-ink-muted">Enregistrez le brouillon pour ajouter des photos.</p> : <Attachments owner={{ diagnostic_id: id }} extraOwners={diag.request_id ? [{ request_id: diag.request_id }] : []} />}
        </Card>

        <Card title="Observations">
          <textarea rows={4} className="input" value={diag.observations} onChange={(e) => set("observations", e.target.value)} />
        </Card>

        <Card title="Estimation">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><dt className="text-ink-muted">Prestations HT</dt><dd className="text-lg font-bold">{formatEuros(totals.servicesGross)}</dd></div>
            <div><dt className="text-ink-muted">Complément minimum</dt><dd className="text-lg font-bold">{formatEuros(totals.minimumAdjustment)}</dd></div>
            <div><dt className="text-ink-muted">Déplacement</dt><dd className="text-lg font-bold">{formatEuros(travel)}</dd></div>
            <div><dt className="text-ink-muted">Total HT calculé</dt><dd className="text-lg font-bold">{formatEuros(totals.totalHt)}</dd></div>
            <div><dt className="text-ink-muted">Temps estimé</dt><dd className="font-semibold">{minutesLabel(minutes)}</dd></div>
            <Field label="Coût matériel / produits HT">
              <input inputMode="decimal" className="input input-sm" defaultValue={centsToInput(diag.material_cost_cents)} key={`m-${savedSnapshot.length}`} onBlur={(e) => { try { set("material_cost_cents", Math.max(0, parseEuros(e.target.value))); } catch { /* ignore */ } }} />
            </Field>
            <Field label="Prix proposé HT (facultatif)">
              <input inputMode="decimal" className="input input-sm" defaultValue={centsToInput(diag.proposed_price_cents)} key={`p-${savedSnapshot.length}`} onBlur={(e) => { try { set("proposed_price_cents", e.target.value.trim() ? parseEuros(e.target.value) : null); } catch { /* ignore */ } }} />
            </Field>
            <div><dt className="text-ink-muted">Taux horaire effectif</dt><dd className="font-semibold">{hourly != null ? `${formatEuros(hourly)}/h` : "—"}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-ink-muted">Estimation interne : le devis reprendra les lignes ci-dessus et reste modifiable avant envoi.</p>
        </Card>
      </div>

      <div className="sticky bottom-16 z-20 mt-6 flex items-center gap-2 overflow-x-auto rounded-2xl border border-stone/40 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <button className="btn-secondary btn-sm" disabled={busy} onClick={() => save()}><Save className="h-4 w-4" /> {dirty ? "Enregistrer" : "Enregistré"}</button>
        {diag.status === "brouillon" && <button className="btn-secondary btn-sm" disabled={busy || !diag.client_id} onClick={() => save("finalise")}>Finaliser</button>}
        {diag.status === "finalise" && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => save("brouillon")}>Repasser en brouillon</button>}
        <button className="btn-primary btn-sm ml-auto" disabled={busy || !diag.client_id || !items.length} onClick={toQuote}><FileSignature className="h-4 w-4" /> Devis</button>
      </div>
    </>
  );
}

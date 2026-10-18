import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowDown, ArrowUp, CalendarPlus, Copy, Eye, FileDown, FilePlus2, GitBranch, Lock, Mail, Plus, Receipt,
  Save, Send, Trash2, Undo2,
} from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { formatDate, formatDateTime, formatKm, todayIso } from "../lib/format";
import { bpsToPercentInput, centsToInput, formatEuros, formatQuantity, parseEuros, percentInputToBps } from "../lib/money";
import { computeTotals, UNIT_LABELS, type LineKind, type Unit } from "../lib/pricing";
import { travelFeeForKm } from "../lib/travel";
import type { Client, DocLine, Invoice, Payment, Quote, Site } from "../lib/types";
import { buildDocView, pdfFileName } from "../pdf/model";
import { downloadBlob, openBlob, renderPdf } from "../pdf/render";
import { useAsync, useUnsavedWarning } from "./hooks";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, useAction, useConfirm } from "./ui";
import { INVOICE_STATUS, PAYMENT_METHODS, QUOTE_STATUS } from "./labels";
import { ClientPicker, SiteSelect } from "./pickers";
import { useSettings } from "./settingsStore";

type Kind = "quote" | "invoice";

interface LineDraft {
  id: string;
  kind: LineKind;
  service_id: string | null;
  label: string;
  description: string;
  quantity: string;
  unit: Unit;
  unit_price_cents: number;
  discount_bps: number;
  percent_bps: number | null;
}

const HEADER_FIELDS = {
  quote: ["client_id", "site_id", "title", "valid_until", "conditions", "notes", "recurrence_text"],
  invoice: ["client_id", "site_id", "title", "service_date", "service_period_end", "due_date", "notes"],
  common: ["vat_rate_bps", "vat_exempt", "apply_minimum", "minimum_cents", "travel_distance_km", "travel_fee_cents", "travel_fee_override_cents", "travel_override_reason"],
} as const;

const toDraft = (l: DocLine): LineDraft => ({
  id: l.id, kind: l.kind, service_id: l.service_id, label: l.label, description: l.description,
  quantity: formatQuantity(Number(l.quantity)).replace(/\s/g, ""), unit: l.unit, unit_price_cents: Number(l.unit_price_cents),
  discount_bps: l.discount_bps, percent_bps: l.percent_bps,
});

function MoneyInput({ cents, onChange, className = "input", allowNegative = false, ariaLabel }: { cents: number | null; onChange: (c: number | null) => void; className?: string; allowNegative?: boolean; ariaLabel?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      className={className}
      value={text ?? centsToInput(cents)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text == null) return;
        try {
          const v = text.trim() === "" ? null : parseEuros(text);
          onChange(v != null && !allowNegative ? Math.abs(v) : v);
        } catch { /* valeur invalide : on revient à la précédente */ }
        setText(null);
      }}
    />
  );
}

export default function DocumentEditor({ kind, id }: { kind: Kind; id: string }) {
  const nav = useNavigate();
  const confirm = useConfirm();
  const { busy, run } = useAction();
  const { settings, bands, services, categories } = useSettings();
  const table = kind === "quote" ? "quotes" : "invoices";
  const linesTable = kind === "quote" ? "quote_lines" : "invoice_lines";
  const fk = kind === "quote" ? "quote_id" : "invoice_id";
  const base = kind === "quote" ? "/admin/devis" : "/admin/factures";

  const [header, setHeader] = useState<Record<string, unknown>>({});
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saved, setSaved] = useState("");
  const [site, setSite] = useState<Site | null>(null);
  const [dbTotals, setDbTotals] = useState<Record<string, number>>({});
  const [payModal, setPayModal] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const doc = (await must(supabase.from(table).select("*").eq("id", id).single())) as Quote | Invoice;
    const [ls, client, siteRow, payments, related] = await Promise.all([
      must(supabase.from(linesTable).select("*").eq(fk, id).order("position")),
      doc.client_id ? must(supabase.from("clients").select("*").eq("id", doc.client_id).single()) : null,
      doc.site_id ? must(supabase.from("sites").select("*").eq("id", doc.site_id).single()) : null,
      kind === "invoice" ? must(supabase.from("payments").select("*").eq("invoice_id", id).order("paid_on")) : [],
      kind === "invoice"
        ? must(supabase.from("invoices").select("id,number,kind,status,total_ttc_cents,issue_date,credited_invoice_id").or(`credited_invoice_id.eq.${id}${(doc as Invoice).credited_invoice_id ? `,id.eq.${(doc as Invoice).credited_invoice_id}` : ""}`))
        : must(supabase.from("quotes").select("id,number,version,status,created_at").or(`id.eq.${(doc as Quote).root_id ?? id},root_id.eq.${(doc as Quote).root_id ?? id}`).order("version")),
    ]);
    const h: Record<string, unknown> = {};
    [...HEADER_FIELDS[kind], ...HEADER_FIELDS.common].forEach((k) => (h[k] = (doc as unknown as Record<string, unknown>)[k]));
    const drafts = (ls as DocLine[]).map(toDraft);
    setHeader(h);
    setLines(drafts);
    setDbTotals(Object.fromEntries((ls as DocLine[]).map((l) => [l.id, Number(l.total_ht_cents)])));
    setSite(siteRow as Site | null);
    setSaved(JSON.stringify({ h, drafts }));
    return { doc, client: client as Client | null, payments: payments as Payment[], related: related as Record<string, unknown>[] };
  }, [id, kind]);

  const editable = data?.doc.status === "brouillon";
  const dirty = editable && saved !== "" && JSON.stringify({ h: header, drafts: lines }) !== saved;
  useUnsavedWarning(dirty);

  const preview = useMemo(
    () =>
      computeTotals(
        lines.map((l) => ({ kind: l.kind, quantity: l.quantity.replace(",", ".") || "0", unit_price_cents: l.unit_price_cents, discount_bps: l.discount_bps, percent_bps: l.percent_bps })),
        {
          apply_minimum: Boolean(header.apply_minimum), minimum_cents: Number(header.minimum_cents ?? 0),
          travel_fee_cents: Number(header.travel_fee_cents ?? 0),
          travel_fee_override_cents: header.travel_fee_override_cents == null ? null : Number(header.travel_fee_override_cents),
          vat_rate_bps: Number(header.vat_rate_bps ?? 0), vat_exempt: Boolean(header.vat_exempt),
        },
      ),
    [lines, header],
  );

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const { doc, client } = data;
  const inv = kind === "invoice" ? (doc as Invoice) : null;
  const quote = kind === "quote" ? (doc as Quote) : null;
  const isAvoir = inv?.kind === "avoir";
  const statusInfo = quote ? QUOTE_STATUS[quote.status] : INVOICE_STATUS[inv!.status];
  const docLabel = quote ? "Devis" : isAvoir ? "Avoir" : "Facture";
  const km = header.travel_distance_km == null ? null : Number(header.travel_distance_km);
  const far = km != null && settings != null && km > settings.manual_review_km;
  const set = (k: string, v: unknown) => setHeader((h) => ({ ...h, [k]: v }));
  const updLine = (lid: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => setLines((ls) => { const c = [...ls]; const j = i + d; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c; });

  function addService(serviceId: string) {
    const sv = services.find((s) => s.id === serviceId);
    if (!sv) return;
    setLines((ls) => [...ls, { id: crypto.randomUUID(), kind: "service", service_id: sv.id, label: sv.name, description: sv.description, quantity: "1", unit: sv.unit, unit_price_cents: sv.unit_price_cents, discount_bps: 0, percent_bps: null }]);
  }
  function addLine(k: LineKind, preset: Partial<LineDraft> = {}) {
    setLines((ls) => [...ls, { id: crypto.randomUUID(), kind: k, service_id: null, label: "", description: "", quantity: "1", unit: k === "service" ? "unite" : "forfait", unit_price_cents: 0, discount_bps: 0, percent_bps: null, ...preset }]);
  }

  async function save(): Promise<boolean> {
    const ok = await run(async () => {
      const bad = lines.find((l) => { try { if (l.kind !== "note") { parseEuros(l.quantity); } return false; } catch { return true; } });
      if (bad) throw new Error(`Quantité invalide sur la ligne « ${bad.label || "sans titre"} ».`);
      await must(supabase.from(table).update(header).eq("id", id));
      const keep = lines.map((l) => l.id);
      let del = supabase.from(linesTable).delete().eq(fk, id);
      if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
      await must(del);
      if (lines.length) {
        await must(supabase.from(linesTable).upsert(lines.map((l, i) => ({
          id: l.id, [fk]: id, position: i + 1, kind: l.kind, service_id: l.service_id, label: l.label, description: l.description,
          quantity: l.kind === "note" ? 0 : l.quantity.replace(",", ".") || "0", unit: l.unit, unit_price_cents: l.unit_price_cents,
          discount_bps: l.kind === "service" ? l.discount_bps : 0, percent_bps: l.kind === "adjustment" ? l.percent_bps : null,
        }))));
      }
      return true;
    }, "Enregistré");
    if (ok) await reload();
    return Boolean(ok);
  }

  async function makePdf(fromDoc = doc) {
    const { data: ls } = await supabase.from(linesTable).select("*").eq(fk, id).order("position");
    const credited = inv?.credited_invoice_id ? (data!.related.find((r) => r.id === inv.credited_invoice_id)?.number as string | undefined) : null;
    const view = buildDocView(kind, fromDoc, { seller: settings, client, site, lines: (ls as DocLine[]) ?? [], creditedNumber: credited });
    return { view, blob: await renderPdf(view) };
  }

  async function downloadPdf() {
    await run(async () => {
      if (doc.pdf_path) {
        const { data: file } = await supabase.storage.from("documents").download(doc.pdf_path);
        if (file) return downloadBlob(file, doc.pdf_path.split("/").pop()!);
      }
      const { view, blob } = await makePdf();
      downloadBlob(blob, pdfFileName(view));
    });
  }

  async function issue() {
    if (dirty && !(await save())) return;
    const warnings: string[] = [];
    if (!header.site_id) warnings.push("Aucune adresse d'intervention n'est renseignée.");
    if (client?.kind === "professionnel" && !client.siren) warnings.push("Le SIREN du client professionnel n'est pas renseigné.");
    if (far) warnings.push("Le chantier est au-delà de la distance de validation manuelle.");
    if (preview.totalHt === 0 && !isAvoir) warnings.push("Le montant total est nul.");
    const simulation = settings?.mode !== "exploitation";
    const ok = await confirm({
      title: `Émettre ${quote ? "le devis" : isAvoir ? "l'avoir" : "la facture"} ?`,
      confirmLabel: "Émettre",
      message: (
        <div className="space-y-2">
          <p>Un numéro {simulation ? "de simulation" : "définitif"} sera attribué et le contenu ne sera plus modifiable{quote ? " (une nouvelle version restera possible)" : " (corrections uniquement par avoir)"}.</p>
          <p className="font-semibold">Total : {formatEuros(preview.totalTtc)} TTC</p>
          {warnings.map((w) => <p key={w} className="flex gap-2 text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /> {w}</p>)}
        </div>
      ),
    });
    if (!ok) return;
    const issued = await run(() => must(supabase.rpc(quote ? "issue_quote" : "issue_invoice", { p_id: id })), quote ? "Devis émis" : isAvoir ? "Avoir émis" : "Facture émise");
    if (!issued) return;
    // Archivage du PDF à partir de l'instantané figé
    try {
      const fresh = (await must(supabase.from(table).select("*").eq("id", id).single())) as Quote | Invoice;
      const { view, blob } = await makePdf(fresh);
      const path = `${kind === "quote" ? "devis" : "factures"}/${new Date().getFullYear()}/${pdfFileName(view)}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (!upErr) await supabase.from(table).update({ pdf_path: path }).eq("id", id);
    } catch { /* le PDF reste régénérable depuis l'instantané */ }
    reload();
  }

  async function rpcNav(fn: string, args: Record<string, unknown>, to: (r: string) => string, msg: string) {
    const r = await run(() => must(supabase.rpc(fn, args)), msg);
    if (r) nav(to(r as string));
  }

  async function setQuoteStatus(status: Quote["status"]) {
    await run(() => must(supabase.from("quotes").update({ status }).eq("id", id)), "Statut mis à jour");
    reload();
  }

  async function removeDraft() {
    if (!(await confirm({ title: "Supprimer ce brouillon ?", danger: true, confirmLabel: "Supprimer" }))) return;
    if (await run(() => must(supabase.from(table).delete().eq("id", id)), "Brouillon supprimé") !== undefined) nav(base);
  }

  const totals = editable
    ? { gross: preview.servicesGross, adj: preview.adjustments, min: preview.minimumAdjustment, travel: preview.travel, ht: preview.totalHt, vat: preview.totalVat, ttc: preview.totalTtc }
    : { gross: Number(doc.services_gross_cents), adj: Number(doc.adjustments_cents), min: Number(doc.minimum_adjustment_cents), travel: Number(doc.travel_billed_cents), ht: Number(doc.total_ht_cents), vat: Number(doc.total_vat_cents), ttc: Number(doc.total_ttc_cents) };
  const remaining = inv && !isAvoir ? Number(inv.total_ttc_cents) - Number(inv.paid_cents) - Number(inv.credited_cents) : 0;
  const franchise = settings?.vat_regime === "franchise";

  return (
    <>
      <PageHeader
        back={base}
        title={<>{docLabel} {doc.number ?? <span className="text-ink-muted">(brouillon)</span>}</>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
            {doc.is_simulation && doc.status !== "brouillon" && <Badge tone="warn">Simulation</Badge>}
            {quote && quote.version > 1 && <Badge>Version {quote.version}</Badge>}
            {doc.issue_date && <span>Émis le {formatDate(doc.issue_date)}</span>}
          </span>
        }
        actions={
          <>
            {!editable && <button className="btn-secondary btn-sm" disabled={busy} onClick={downloadPdf}><FileDown className="h-4 w-4" /> PDF</button>}
            {!editable && client?.email && (
              <a className="btn-secondary btn-sm" href={`mailto:${client.email}?subject=${encodeURIComponent(`${docLabel} ${doc.number ?? ""} — ${settings?.trade_name ?? "AF Nettoyage"}`)}&body=${encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint ${quote ? "notre devis" : isAvoir ? "notre avoir" : "notre facture"} n° ${doc.number}.\n\nCordialement,\n${settings?.trade_name ?? ""}`)}`}>
                <Mail className="h-4 w-4" /> E-mail
              </a>
            )}
          </>
        }
      />

      {!editable && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-white p-3 text-sm text-ink-muted">
          <Lock className="h-4 w-4" /> Document émis : contenu figé tel que présenté au client{doc.snapshot ? ` (instantané du ${formatDateTime(doc.snapshot.frozen_at)})` : ""}.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card title="Client et chantier">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client">
                <ClientPicker value={(header.client_id as string) ?? null} disabled={!editable} onChange={(c) => setHeader((h) => ({ ...h, client_id: c?.id ?? null, site_id: null }))} />
              </Field>
              <Field label="Adresse d'intervention" hint={km != null ? `${formatKm(km)} à vol d'oiseau` : undefined}>
                <SiteSelect
                  clientId={(header.client_id as string) ?? null}
                  value={(header.site_id as string) ?? null}
                  disabled={!editable}
                  onChange={(s) => {
                    setSite(s);
                    const d = s?.distance_km == null ? null : Number(s.distance_km);
                    setHeader((h) => ({ ...h, site_id: s?.id ?? null, travel_distance_km: d, travel_fee_cents: travelFeeForKm(d, bands) }));
                  }}
                />
              </Field>
              <Field label="Objet" className="sm:col-span-2">
                <input className="input" disabled={!editable} value={(header.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Ex. Nettoyage des vitres — maison" />
              </Field>
              {quote ? (
                <>
                  <Field label="Valable jusqu'au" hint={editable ? `Par défaut : ${settings?.quote_validity_days ?? 30} jours après émission.` : undefined}>
                    <input type="date" className="input" disabled={!editable} value={(header.valid_until as string) ?? ""} onChange={(e) => set("valid_until", e.target.value || null)} />
                  </Field>
                  <Field label="Récurrence proposée">
                    <input className="input" disabled={!editable} value={(header.recurrence_text as string) ?? ""} onChange={(e) => set("recurrence_text", e.target.value)} placeholder="Ex. 2 passages par mois, le mardi matin" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Date de prestation" hint="Mention obligatoire. Par défaut : date d'émission.">
                    <input type="date" className="input" disabled={!editable} value={(header.service_date as string) ?? ""} onChange={(e) => set("service_date", e.target.value || null)} />
                  </Field>
                  <Field label="Fin de période (prestations récurrentes)">
                    <input type="date" className="input" disabled={!editable} value={(header.service_period_end as string) ?? ""} onChange={(e) => set("service_period_end", e.target.value || null)} />
                  </Field>
                  {!isAvoir && (
                    <Field label="Échéance" hint={editable ? `Par défaut : ${settings?.payment_terms_days ?? 30} jours après émission.` : undefined}>
                      <input type="date" className="input" disabled={!editable} value={(header.due_date as string) ?? ""} min={todayIso()} onChange={(e) => set("due_date", e.target.value || null)} />
                    </Field>
                  )}
                </>
              )}
            </div>
            {far && <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Chantier éloigné : vérifier la faisabilité et les frais de déplacement.</p>}
          </Card>

          <Card title="Lignes">
            <div className="space-y-2">
              {lines.length === 0 && <p className="text-sm text-ink-muted">Aucune ligne.</p>}
              {lines.map((l, i) => {
                const lineTotal = editable ? preview.lineTotals[i] : dbTotals[l.id] ?? 0;
                return (
                  <div key={l.id} className="rounded-xl border border-stone/40 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          {l.kind !== "service" && <Badge tone="muted">{l.kind === "note" ? "Texte" : (l.percent_bps ?? 0) < 0 || l.unit_price_cents < 0 ? "Remise" : "Majoration"}</Badge>}
                          <input className="input input-sm font-semibold" disabled={!editable} value={l.label} placeholder={l.kind === "note" ? "Texte libre" : "Désignation"} onChange={(e) => updLine(l.id, { label: e.target.value })} />
                        </div>
                        {l.kind === "service" && (
                          <>
                            <textarea rows={1} className="input input-sm" disabled={!editable} value={l.description} placeholder="Détail (facultatif)" onChange={(e) => updLine(l.id, { description: e.target.value })} />
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <Field label="Quantité"><input inputMode="decimal" className="input input-sm" disabled={!editable} value={l.quantity} onChange={(e) => updLine(l.id, { quantity: e.target.value })} /></Field>
                              <Field label="Unité">
                                <select className="input input-sm" disabled={!editable} value={l.unit} onChange={(e) => updLine(l.id, { unit: e.target.value as Unit })}>
                                  {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}
                                </select>
                              </Field>
                              <Field label="PU HT">{editable ? <MoneyInput className="input input-sm" cents={l.unit_price_cents} onChange={(c) => updLine(l.id, { unit_price_cents: c ?? 0 })} /> : <p className="py-1.5 text-sm">{formatEuros(l.unit_price_cents)}</p>}</Field>
                              <Field label="Remise %">
                                <input inputMode="decimal" className="input input-sm" disabled={!editable} defaultValue={bpsToPercentInput(l.discount_bps) || ""} onBlur={(e) => { try { updLine(l.id, { discount_bps: Math.min(10000, Math.max(0, percentInputToBps(e.target.value || "0"))) }); } catch { /* ignore */ } }} />
                              </Field>
                            </div>
                          </>
                        )}
                        {l.kind === "adjustment" && (
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Type">
                              <select className="input input-sm" disabled={!editable} value={l.percent_bps != null ? "pct" : "fixe"} onChange={(e) => updLine(l.id, e.target.value === "pct" ? { percent_bps: -1000, unit_price_cents: 0 } : { percent_bps: null, unit_price_cents: -1000, quantity: "1" })}>
                                <option value="pct">% des prestations</option>
                                <option value="fixe">Montant fixe HT</option>
                              </select>
                            </Field>
                            {l.percent_bps != null ? (
                              <Field label="Pourcentage (négatif = remise)">
                                <input inputMode="decimal" className="input input-sm" disabled={!editable} defaultValue={bpsToPercentInput(l.percent_bps)} onBlur={(e) => { try { updLine(l.id, { percent_bps: Math.max(-10000, Math.min(10000, percentInputToBps(e.target.value || "0"))) }); } catch { /* ignore */ } }} />
                              </Field>
                            ) : (
                              <Field label="Montant HT (négatif = remise)">
                                {editable ? <MoneyInput className="input input-sm" allowNegative cents={l.unit_price_cents} onChange={(c) => updLine(l.id, { unit_price_cents: c ?? 0, quantity: "1" })} /> : <p className="py-1.5 text-sm">{formatEuros(l.unit_price_cents)}</p>}
                              </Field>
                            )}
                          </div>
                        )}
                      </div>
                      {editable && (
                        <div className="flex flex-col gap-1">
                          <button className="btn-ghost btn-sm px-2" onClick={() => move(i, -1)} aria-label="Monter"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button className="btn-ghost btn-sm px-2" onClick={() => move(i, 1)} aria-label="Descendre"><ArrowDown className="h-3.5 w-3.5" /></button>
                          <button className="btn-ghost btn-sm px-2" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                    {l.kind !== "note" && (
                      <p className="mt-2 text-right text-sm font-semibold">{formatEuros(lineTotal)}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {editable && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <select className="input sm:max-w-xs" value="" onChange={(e) => e.target.value && addService(e.target.value)}>
                  <option value="">+ Prestation du catalogue…</option>
                  {categories.map((c) => (
                    <optgroup key={c.id} label={c.name}>
                      {services.filter((s) => s.category_id === c.id && s.active).map((s) => (
                        <option key={s.id} value={s.id}>{s.name} — {formatEuros(s.unit_price_cents)}/{UNIT_LABELS[s.unit].short}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button className="btn-ghost btn-sm" onClick={() => addLine("service")}><Plus className="h-4 w-4" /> Ligne libre</button>
                <button className="btn-ghost btn-sm" onClick={() => addLine("adjustment", { label: "Remise", percent_bps: -1000 })}><Plus className="h-4 w-4" /> Remise / majoration</button>
                <button className="btn-ghost btn-sm" onClick={() => addLine("note")}><Plus className="h-4 w-4" /> Texte</button>
              </div>
            )}
          </Card>

          <Card title="Conditions de calcul">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="TVA" hint={franchise ? settings?.franchise_mention : settings?.vat_regime === "a_definir" ? "Régime de TVA à définir dans les paramètres." : undefined}>
                <select
                  className="input"
                  disabled={!editable || franchise}
                  value={header.vat_exempt ? "exempt" : String(header.vat_rate_bps)}
                  onChange={(e) => e.target.value === "exempt" ? setHeader((h) => ({ ...h, vat_exempt: true, vat_rate_bps: 0 })) : setHeader((h) => ({ ...h, vat_exempt: false, vat_rate_bps: Number(e.target.value) }))}
                >
                  <option value="exempt">Sans TVA (franchise / exonération)</option>
                  <option value="2000">20 %</option>
                  <option value="1000">10 %</option>
                  <option value="550">5,5 %</option>
                </select>
              </Field>
              <Field label="Minimum de prestation" hint="Appliqué au total des prestations, hors déplacement.">
                <label className="flex items-center gap-2 py-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-ink" disabled={!editable} checked={Boolean(header.apply_minimum)} onChange={(e) => set("apply_minimum", e.target.checked)} />
                  Appliquer le minimum de {formatEuros(Number(header.minimum_cents ?? 0))} HT
                </label>
              </Field>
              <Field label="Frais de déplacement calculés">
                <p className="py-2 text-sm">{formatEuros(Number(header.travel_fee_cents ?? 0))} HT {km != null ? `(${formatKm(km)})` : "(adresse non géolocalisée)"}</p>
              </Field>
              <Field label="Montant retenu (dérogation)" hint="Laisser vide pour appliquer le barème.">
                {editable ? <MoneyInput cents={header.travel_fee_override_cents == null ? null : Number(header.travel_fee_override_cents)} onChange={(c) => set("travel_fee_override_cents", c)} /> : <p className="py-2 text-sm">{header.travel_fee_override_cents == null ? "Barème" : formatEuros(Number(header.travel_fee_override_cents))}</p>}
              </Field>
              {header.travel_fee_override_cents != null && (
                <Field label="Motif de la dérogation" className="sm:col-span-2">
                  <input className="input" disabled={!editable} value={(header.travel_override_reason as string) ?? ""} onChange={(e) => set("travel_override_reason", e.target.value)} placeholder="Ex. Geste commercial, tournée groupée" />
                </Field>
              )}
            </div>
          </Card>

          <Card title={quote ? "Conditions et remarques" : "Remarques"}>
            {quote && (
              <Field label="Conditions de réalisation" className="mb-4">
                <textarea rows={4} className="input" disabled={!editable} value={(header.conditions as string) ?? ""} placeholder={settings?.quote_conditions} onChange={(e) => set("conditions", e.target.value)} />
              </Field>
            )}
            <Field label="Remarques (imprimées)">
              <textarea rows={3} className="input" disabled={!editable} value={(header.notes as string) ?? ""} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </Card>

          {inv && !isAvoir && inv.status !== "brouillon" && (
            <Card title="Règlements" actions={remaining > 0 && <button className="btn-primary btn-sm" onClick={() => setPayModal(true)}><Plus className="h-4 w-4" /> Règlement</button>}>
              {data.payments.length === 0 ? <p className="text-sm text-ink-muted">Aucun règlement enregistré.</p> : (
                <ul className="divide-y divide-stone/20 text-sm">
                  {data.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <span>{formatDate(p.paid_on)} · {PAYMENT_METHODS[p.method]}{p.reference && ` · ${p.reference}`}</span>
                      <span className="flex items-center gap-2 font-semibold">
                        {formatEuros(p.amount_cents)}
                        <button className="btn-ghost btn-sm px-2" aria-label="Supprimer le règlement" onClick={async () => {
                          if (!(await confirm({ title: "Supprimer ce règlement ?", message: "À utiliser uniquement pour corriger une erreur de saisie.", danger: true, confirmLabel: "Supprimer" }))) return;
                          await run(() => must(supabase.from("payments").delete().eq("id", p.id)), "Règlement supprimé");
                          reload();
                        }}><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        {/* Colonne de synthèse */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <Card title="Totaux">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt>Prestations</dt><dd>{formatEuros(totals.gross)}</dd></div>
              {totals.adj !== 0 && <div className="flex justify-between"><dt>Remises / majorations</dt><dd>{formatEuros(totals.adj)}</dd></div>}
              {totals.min > 0 && <div className="flex justify-between"><dt>Complément minimum</dt><dd>{formatEuros(totals.min)}</dd></div>}
              <div className="flex justify-between"><dt>Déplacement</dt><dd>{formatEuros(totals.travel)}</dd></div>
              <div className="flex justify-between border-t border-stone/40 pt-1.5 font-semibold"><dt>Total HT</dt><dd>{formatEuros(totals.ht)}</dd></div>
              <div className="flex justify-between"><dt>TVA</dt><dd>{formatEuros(totals.vat)}</dd></div>
              <div className="flex justify-between border-t border-ink pt-1.5 text-lg font-bold"><dt>Total TTC</dt><dd>{formatEuros(totals.ttc)}</dd></div>
              {inv && !isAvoir && inv.status !== "brouillon" && (
                <>
                  <div className="flex justify-between text-ink-muted"><dt>Réglé</dt><dd>{formatEuros(inv.paid_cents)}</dd></div>
                  {Number(inv.credited_cents) > 0 && <div className="flex justify-between text-ink-muted"><dt>Avoirs</dt><dd>{formatEuros(inv.credited_cents)}</dd></div>}
                  <div className="flex justify-between font-semibold"><dt>Reste à payer</dt><dd>{formatEuros(remaining)}</dd></div>
                </>
              )}
            </dl>
            {editable && <p className="mt-3 text-xs text-ink-muted">Aperçu calculé localement ; les montants définitifs sont recalculés par la base à l'enregistrement.</p>}
          </Card>

          <Card title="Actions">
            <div className="flex flex-col gap-2">
              {editable && (
                <>
                  <button className="btn-secondary" disabled={busy || !dirty} onClick={save}><Save className="h-4 w-4" /> {dirty ? "Enregistrer" : "Enregistré"}</button>
                  <button className="btn-ghost" disabled={busy} onClick={async () => { if (dirty && !(await save())) return; await run(async () => openBlob((await makePdf()).blob)); }}><Eye className="h-4 w-4" /> Aperçu PDF</button>
                  <button className="btn-primary" disabled={busy || !header.client_id || !lines.some((l) => l.kind === "service" || l.kind === "adjustment")} onClick={issue}><Send className="h-4 w-4" /> Émettre</button>
                  <button className="btn-ghost text-red-900" disabled={busy} onClick={removeDraft}><Trash2 className="h-4 w-4" /> Supprimer le brouillon</button>
                </>
              )}
              {quote && quote.status === "envoye" && (
                <>
                  <button className="btn-primary" disabled={busy} onClick={() => setQuoteStatus("accepte")}>Marquer accepté</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => setQuoteStatus("refuse")}>Marquer refusé</button>
                  <button className="btn-ghost" disabled={busy} onClick={() => setQuoteStatus("expire")}>Marquer expiré</button>
                </>
              )}
              {quote && quote.status === "accepte" && (
                <>
                  <button className="btn-primary" disabled={busy} onClick={() => rpcNav("invoice_from_quote", { p_quote: id, p_service_date: null }, (r) => `/admin/factures/${r}`, "Facture préparée")}><Receipt className="h-4 w-4" /> Créer la facture</button>
                  <Link className="btn-secondary" to={`/admin/interventions/nouvelle?devis=${id}`}><CalendarPlus className="h-4 w-4" /> Planifier une intervention</Link>
                  <Link className="btn-ghost" to={`/admin/planning?recurrence=1&devis=${id}`}>Créer une récurrence</Link>
                </>
              )}
              {quote && ["refuse", "expire"].includes(quote.status) && (
                <button className="btn-secondary" disabled={busy} onClick={() => setQuoteStatus("envoye")}><Undo2 className="h-4 w-4" /> Rouvrir</button>
              )}
              {quote && ["envoye", "refuse", "expire"].includes(quote.status) && (
                <button className="btn-secondary" disabled={busy} onClick={() => rpcNav("copy_quote", { p_id: id, p_as_version: true }, (r) => `/admin/devis/${r}`, "Nouvelle version créée")}><GitBranch className="h-4 w-4" /> Nouvelle version</button>
              )}
              {quote && quote.status !== "brouillon" && (
                <button className="btn-ghost" disabled={busy} onClick={() => rpcNav("copy_quote", { p_id: id, p_as_version: false }, (r) => `/admin/devis/${r}`, "Devis dupliqué")}><Copy className="h-4 w-4" /> Dupliquer</button>
              )}
              {quote && ["envoye", "accepte"].includes(quote.status) && (
                <button className="btn-ghost text-red-900" disabled={busy} onClick={async () => { if (await confirm({ title: "Annuler ce devis ?", danger: true })) setQuoteStatus("annule"); }}>Annuler le devis</button>
              )}
              {inv && !isAvoir && ["emise", "partiellement_payee", "payee"].includes(inv.status) && (
                <button className="btn-secondary" disabled={busy} onClick={async () => {
                  if (await confirm({ title: "Créer un avoir ?", message: "Un brouillon d'avoir reprenant toutes les lignes est créé. Ajustez-le pour un avoir partiel, puis émettez-le." }))
                    rpcNav("credit_note_for", { p_invoice: id }, (r) => `/admin/factures/${r}`, "Brouillon d'avoir créé");
                }}><FilePlus2 className="h-4 w-4" /> Créer un avoir</button>
              )}
            </div>
          </Card>

          {quote && data.related.length > 1 && (
            <Card title="Versions">
              <ul className="space-y-1 text-sm">
                {data.related.map((r) => (
                  <li key={r.id as string}>
                    <Link to={`/admin/devis/${r.id}`} className={r.id === id ? "font-bold" : "underline"}>
                      V{r.version as number} · {(r.number as string) ?? "brouillon"} · {QUOTE_STATUS[r.status as Quote["status"]].label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {inv && data.related.length > 0 && (
            <Card title={isAvoir ? "Facture d'origine" : "Avoirs"}>
              <ul className="space-y-1 text-sm">
                {data.related.filter((r) => r.id !== id).map((r) => (
                  <li key={r.id as string}>
                    <Link to={`/admin/factures/${r.id}`} className="underline">{r.kind === "avoir" ? "Avoir" : "Facture"} {(r.number as string) ?? "brouillon"} · {formatEuros(r.total_ttc_cents as number)}</Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {inv && inv.status !== "brouillon" && !inv.is_simulation && (
            <Card title="Facturation électronique">
              <p className="mb-3 text-xs text-ink-muted">Suivi de la transmission via une plateforme agréée (réforme 2026-2027). Le PDF seul ne constitue pas une facture électronique.</p>
              <select className="input input-sm" value={inv.einvoice_status} onChange={async (e) => { await run(() => must(supabase.from("invoices").update({ einvoice_status: e.target.value }).eq("id", id)), "Statut mis à jour"); reload(); }}>
                <option value="non_transmise">Non transmise</option>
                <option value="transmise">Transmise</option>
                <option value="deposee">Déposée</option>
                <option value="rejetee">Rejetée</option>
                <option value="encaissee">Encaissée</option>
              </select>
            </Card>
          )}

          {(quote?.request_id || quote?.diagnostic_id || inv?.quote_id) && (
            <Card title="Liens">
              <ul className="space-y-1 text-sm">
                {quote?.request_id && <li><Link className="underline" to={`/admin/demandes/${quote.request_id}`}>Demande d'origine</Link></li>}
                {quote?.diagnostic_id && <li><Link className="underline" to={`/admin/diagnostics/${quote.diagnostic_id}`}>Diagnostic</Link></li>}
                {inv?.quote_id && <li><Link className="underline" to={`/admin/devis/${inv.quote_id}`}>Devis d'origine</Link></li>}
                {doc.client_id && <li><Link className="underline" to={`/admin/clients/${doc.client_id}`}>Fiche client</Link></li>}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {editable && dirty && (
        <div className="fixed inset-x-0 bottom-16 z-20 flex justify-center px-4 lg:bottom-6 lg:pl-64">
          <button className="btn-primary shadow-lg" disabled={busy} onClick={save}><Save className="h-4 w-4" /> Enregistrer les modifications</button>
        </div>
      )}

      {inv && <PaymentModal open={payModal} onClose={() => setPayModal(false)} invoiceId={id} remaining={remaining} onSaved={() => { setPayModal(false); reload(); }} />}
    </>
  );
}

function PaymentModal({ open, onClose, invoiceId, remaining, onSaved }: { open: boolean; onClose: () => void; invoiceId: string; remaining: number; onSaved: () => void }) {
  const [f, setF] = useState({ paid_on: todayIso(), amount: centsToInput(remaining), method: "virement", reference: "" });
  const { busy, run } = useAction();
  useEffect(() => {
    if (open) setF({ paid_on: todayIso(), amount: centsToInput(remaining), method: "virement", reference: "" });
  }, [open, remaining]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enregistrer un règlement"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={busy} onClick={async () => {
            const ok = await run(async () => {
              const amount = parseEuros(f.amount);
              if (amount <= 0) throw new Error("Montant invalide.");
              await must(supabase.from("payments").insert({ invoice_id: invoiceId, paid_on: f.paid_on, amount_cents: amount, method: f.method, reference: f.reference }));
              return true;
            }, "Règlement enregistré");
            if (ok) onSaved();
          }}>Enregistrer</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date"><input type="date" className="input" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
        <Field label="Montant TTC" hint={`Reste à payer : ${formatEuros(remaining)}`}><input inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Moyen">
          <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Référence"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="N° de chèque, libellé…" /></Field>
      </div>
    </Modal>
  );
}

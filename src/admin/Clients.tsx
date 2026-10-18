import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarPlus, ClipboardList, FileSignature, Mail, MapPin, Pencil, Phone, Plus } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { formatDate, formatDateTime, formatKm } from "../lib/format";
import { formatEuros } from "../lib/money";
import type { Client, Diagnostic, Intervention, Invoice, Quote, RequestRow, Site } from "../lib/types";
import { useAsync, useUnsavedWarning } from "./hooks";
import { Badge, Card, Empty, ErrorBox, Field, Loading, PageHeader, SearchInput, Tabs, useAction, useConfirm } from "./ui";
import { INTERVENTION_STATUS, INVOICE_STATUS, QUOTE_STATUS, REQUEST_STATUS } from "./labels";
import { SiteFormModal } from "./pickers";

export function ClientList() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"tous" | "particulier" | "professionnel">("tous");
  const [archived, setArchived] = useState(false);
  const { data, error, loading, reload } = useAsync(async () => {
    let query = supabase.from("clients").select("*, sites(city)").eq("archived", archived).order("display_name").limit(500);
    if (kind !== "tous") query = query.eq("kind", kind);
    return (await must(query)) as (Client & { sites: { city: string }[] })[];
  }, [kind, archived]);
  const rows = (data ?? []).filter((c) => !q || `${c.display_name} ${c.email} ${c.phone} ${c.sites.map((s) => s.city).join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Clients" actions={<Link to="/admin/clients/nouveau" className="btn-primary btn-sm"><Plus className="h-4 w-4" /> Nouveau client</Link>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={kind} onChange={setKind} tabs={[{ value: "tous", label: "Tous" }, { value: "particulier", label: "Particuliers" }, { value: "professionnel", label: "Professionnels" }]} />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-ink" /> Archivés</label>
          <SearchInput value={q} onChange={setQ} placeholder="Nom, e-mail, ville…" />
        </div>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <Loading />}
      {!loading && rows.length === 0 && <Empty title="Aucun client">Les clients sont créés manuellement ou à partir d'une demande reçue.</Empty>}
      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-stone/20">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to={`/admin/clients/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.display_name || "(sans nom)"}</span>
                    <span className="block truncate text-xs text-ink-muted">{[c.email, c.phone, ...new Set(c.sites.map((s) => s.city))].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Badge tone={c.kind === "professionnel" ? "dark" : "neutral"}>{c.kind === "professionnel" ? "Pro" : "Particulier"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

const EMPTY_CLIENT = {
  kind: "particulier" as Client["kind"], first_name: "", last_name: "", company_name: "", siren: "", vat_number: "",
  email: "", phone: "", billing_address_line1: "", billing_address_line2: "", billing_postal_code: "", billing_city: "", notes: "",
};

export function ClientForm({ initial, onSaved, onCancel }: { initial?: Client; onSaved: (c: Client) => void; onCancel?: () => void }) {
  const [f, setF] = useState(initial ? { ...EMPTY_CLIENT, ...initial } : EMPTY_CLIENT);
  const { busy, run } = useAction();
  const dirty = JSON.stringify(f) !== JSON.stringify(initial ? { ...EMPTY_CLIENT, ...initial } : EMPTY_CLIENT);
  useUnsavedWarning(dirty);
  const set = (k: keyof typeof EMPTY_CLIENT) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pro = f.kind === "professionnel";
  const invalid = pro ? !f.company_name.trim() : !f.last_name.trim();
  const sirenWarn = pro && f.siren && !/^\d{9}$/.test(f.siren.replace(/\s/g, ""));

  async function save() {
    const payload = Object.fromEntries(Object.keys(EMPTY_CLIENT).map((k) => [k, (f as Record<string, unknown>)[k]]));
    payload.siren = String(payload.siren ?? "").replace(/\s/g, "");
    const saved = await run(
      () => initial
        ? must(supabase.from("clients").update(payload).eq("id", initial.id).select().single())
        : must(supabase.from("clients").insert(payload).select().single()),
      "Client enregistré",
    );
    if (saved) onSaved(saved as Client);
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-full border border-stone/60 bg-white p-1">
        {(["particulier", "professionnel"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${f.kind === k ? "bg-ink text-paper" : "text-ink-muted"}`}>
            {k === "particulier" ? "Particulier" : "Professionnel"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {pro && <Field label="Raison sociale *" className="sm:col-span-2"><input className="input" value={f.company_name} onChange={set("company_name")} /></Field>}
        <Field label={pro ? "Prénom du contact" : "Prénom"}><input className="input" value={f.first_name} onChange={set("first_name")} /></Field>
        <Field label={pro ? "Nom du contact" : "Nom *"}><input className="input" value={f.last_name} onChange={set("last_name")} /></Field>
        <Field label="E-mail"><input type="email" className="input" value={f.email} onChange={set("email")} /></Field>
        <Field label="Téléphone"><input type="tel" className="input" value={f.phone} onChange={set("phone")} /></Field>
        {pro && (
          <>
            <Field label="SIREN" hint={sirenWarn ? "Le SIREN comporte 9 chiffres." : "Obligatoire sur les factures B2B (réforme de la facturation électronique)."}><input className="input" inputMode="numeric" value={f.siren} onChange={set("siren")} /></Field>
            <Field label="N° TVA intracommunautaire"><input className="input" value={f.vat_number} onChange={set("vat_number")} /></Field>
          </>
        )}
        <Field label="Adresse de facturation" className="sm:col-span-2"><input className="input" value={f.billing_address_line1} onChange={set("billing_address_line1")} /></Field>
        <Field label="Complément" className="sm:col-span-2"><input className="input" value={f.billing_address_line2} onChange={set("billing_address_line2")} /></Field>
        <Field label="Code postal"><input className="input" value={f.billing_postal_code} onChange={set("billing_postal_code")} /></Field>
        <Field label="Ville"><input className="input" value={f.billing_city} onChange={set("billing_city")} /></Field>
        <Field label="Notes internes" className="sm:col-span-2"><textarea rows={3} className="input" value={f.notes} onChange={set("notes")} /></Field>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || invalid} onClick={save}>Enregistrer</button>
        {onCancel && <button className="btn-ghost" onClick={onCancel}>Annuler</button>}
      </div>
    </div>
  );
}

export function ClientNew() {
  const nav = useNavigate();
  return (
    <>
      <PageHeader back="/admin/clients" title="Nouveau client" />
      <Card><ClientForm onSaved={(c) => nav(`/admin/clients/${c.id}`, { replace: true })} /></Card>
    </>
  );
}

type Tab = "historique" | "adresses" | "infos";

export function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { busy, run } = useAction();
  const [tab, setTab] = useState<Tab>("historique");
  const [editing, setEditing] = useState(false);
  const [siteModal, setSiteModal] = useState<{ open: boolean; site: Site | null }>({ open: false, site: null });

  const { data, error, loading, reload } = useAsync(async () => {
    const [client, sites, requests, diagnostics, quotes, invoices, interventions] = await Promise.all([
      must(supabase.from("clients").select("*").eq("id", id).single()),
      must(supabase.from("sites").select("*").eq("client_id", id).order("created_at")),
      must(supabase.from("requests").select("*").eq("client_id", id).order("created_at", { ascending: false })),
      must(supabase.from("diagnostics").select("*").eq("client_id", id).order("created_at", { ascending: false })),
      must(supabase.from("quotes").select("*").eq("client_id", id).order("created_at", { ascending: false })),
      must(supabase.from("invoices").select("*").eq("client_id", id).order("created_at", { ascending: false })),
      must(supabase.from("interventions").select("*").eq("client_id", id).order("starts_at", { ascending: false }).limit(50)),
    ]);
    return {
      client: client as Client, sites: sites as Site[], requests: requests as RequestRow[], diagnostics: diagnostics as Diagnostic[],
      quotes: quotes as Quote[], invoices: invoices as Invoice[], interventions: interventions as Intervention[],
    };
  }, [id]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const { client: c } = data;
  const billed = data.invoices.filter((i) => i.status !== "brouillon").reduce((a, i) => a + (i.kind === "avoir" ? -1 : 1) * Number(i.total_ttc_cents), 0);
  const due = data.invoices.filter((i) => i.kind === "facture" && ["emise", "partiellement_payee"].includes(i.status)).reduce((a, i) => a + Number(i.total_ttc_cents) - Number(i.paid_cents) - Number(i.credited_cents), 0);

  async function newQuote() {
    const q = await run(() => must(supabase.rpc("new_quote", { p_client: c.id, p_site: data!.sites[0]?.id ?? null, p_request: null, p_diagnostic: null })));
    if (q) nav(`/admin/devis/${q}`);
  }

  return (
    <>
      <PageHeader
        back="/admin/clients"
        title={c.display_name || "(sans nom)"}
        subtitle={<>{c.kind === "professionnel" ? "Professionnel" : "Particulier"}{c.archived && " · archivé"} · client depuis le {formatDate(c.created_at)}</>}
        actions={
          <>
            <Link to={`/admin/diagnostics/nouveau?client=${c.id}`} className="btn-secondary btn-sm"><ClipboardList className="h-4 w-4" /> Diagnostic</Link>
            <Link to={`/admin/interventions/nouvelle?client=${c.id}`} className="btn-secondary btn-sm"><CalendarPlus className="h-4 w-4" /> Intervention</Link>
            <button className="btn-primary btn-sm" disabled={busy} onClick={newQuote}><FileSignature className="h-4 w-4" /> Devis</button>
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card flex flex-col gap-1 p-4 text-sm">
          {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-2 underline"><Mail className="h-4 w-4" />{c.email}</a>}
          {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 underline"><Phone className="h-4 w-4" />{c.phone}</a>}
          {!c.email && !c.phone && <span className="text-ink-muted">Pas de coordonnées</span>}
        </div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Facturé TTC</p><p className="mt-1 text-xl font-bold">{formatEuros(billed)}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Reste dû</p><p className="mt-1 text-xl font-bold">{formatEuros(due)}</p></div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[{ value: "historique", label: "Historique" }, { value: "adresses", label: `Adresses (${data.sites.length})` }, { value: "infos", label: "Informations" }]} />

      {tab === "historique" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <HistoryCard title="Devis" items={data.quotes.map((q) => ({ id: q.id, to: `/admin/devis/${q.id}`, label: q.number ?? "Brouillon", sub: q.title || formatDate(q.created_at), amount: q.total_ttc_cents, badge: QUOTE_STATUS[q.status] }))} />
          <HistoryCard title="Factures" items={data.invoices.map((i) => ({ id: i.id, to: `/admin/factures/${i.id}`, label: `${i.kind === "avoir" ? "Avoir " : ""}${i.number ?? "Brouillon"}`, sub: formatDate(i.issue_date ?? i.created_at), amount: i.total_ttc_cents, badge: INVOICE_STATUS[i.status] }))} />
          <HistoryCard title="Interventions" items={data.interventions.map((i) => ({ id: i.id, to: `/admin/interventions/${i.id}`, label: formatDateTime(i.starts_at), sub: i.title, badge: INTERVENTION_STATUS[i.status] }))} />
          <HistoryCard title="Diagnostics" items={data.diagnostics.map((d) => ({ id: d.id, to: `/admin/diagnostics/${d.id}`, label: formatDate(d.visit_date ?? d.created_at), sub: d.frequency, badge: d.status === "brouillon" ? { label: "Brouillon", tone: "warn" as const } : { label: "Finalisé", tone: "ok" as const } }))} />
          <HistoryCard title="Demandes" items={data.requests.map((r) => ({ id: r.id, to: `/admin/demandes/${r.id}`, label: formatDate(r.created_at), sub: r.category_slugs.join(", ") || r.message.slice(0, 60), badge: REQUEST_STATUS[r.status] }))} />
        </div>
      )}

      {tab === "adresses" && (
        <Card title="Adresses d'intervention" actions={<button className="btn-secondary btn-sm" onClick={() => setSiteModal({ open: true, site: null })}><Plus className="h-4 w-4" /> Ajouter</button>}>
          {data.sites.length === 0 ? <Empty title="Aucune adresse" /> : (
            <ul className="divide-y divide-stone/20">
              {data.sites.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                    <div className="text-sm">
                      {s.label && <p className="font-semibold">{s.label}</p>}
                      <p>{s.address_line1}{s.address_line2 && `, ${s.address_line2}`}, {s.postal_code} {s.city}</p>
                      <p className="text-xs text-ink-muted">{s.distance_km != null ? `${formatKm(s.distance_km)} d'Empalot` : "Non géolocalisée"}{s.access_notes && ` · ${s.access_notes}`}</p>
                    </div>
                  </div>
                  <button className="btn-ghost btn-sm" onClick={() => setSiteModal({ open: true, site: s })} aria-label="Modifier"><Pencil className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "infos" && (
        <Card>
          {editing ? (
            <ClientForm initial={c} onSaved={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />
          ) : (
            <div className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {c.kind === "professionnel" && <><div><dt className="text-ink-muted">SIREN</dt><dd>{c.siren || "—"}</dd></div><div><dt className="text-ink-muted">TVA</dt><dd>{c.vat_number || "—"}</dd></div></>}
                <div className="sm:col-span-2"><dt className="text-ink-muted">Adresse de facturation</dt><dd>{[c.billing_address_line1, c.billing_address_line2, `${c.billing_postal_code} ${c.billing_city}`.trim()].filter(Boolean).join(", ") || "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-ink-muted">Notes internes</dt><dd className="whitespace-pre-line">{c.notes || "—"}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Modifier</button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={async () => {
                    if (!c.archived && !(await confirm({ title: "Archiver ce client ?", message: "Il n'apparaîtra plus dans les listes. Son historique est conservé." }))) return;
                    await run(() => must(supabase.from("clients").update({ archived: !c.archived }).eq("id", c.id)), c.archived ? "Client réactivé" : "Client archivé");
                    reload();
                  }}
                >
                  {c.archived ? "Réactiver" : "Archiver"}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      <SiteFormModal open={siteModal.open} site={siteModal.site} clientId={c.id} onClose={() => setSiteModal({ open: false, site: null })} onSaved={() => { setSiteModal({ open: false, site: null }); reload(); }} />
    </>
  );
}

function HistoryCard({ title, items }: { title: string; items: { id: string; to: string; label: string; sub?: string; amount?: number; badge: { label: string; tone: "neutral" | "dark" | "info" | "ok" | "warn" | "bad" | "muted" } }[] }) {
  return (
    <Card title={`${title} (${items.length})`}>
      {items.length === 0 ? <p className="text-sm text-ink-muted">Aucun élément.</p> : (
        <ul className="-my-2 divide-y divide-stone/20">
          {items.slice(0, 8).map((i) => (
            <li key={i.id}>
              <Link to={i.to} className="flex items-center justify-between gap-3 py-2 text-sm hover:underline">
                <span className="min-w-0"><span className="block truncate font-medium">{i.label}</span>{i.sub && <span className="block truncate text-xs text-ink-muted">{i.sub}</span>}</span>
                <span className="flex shrink-0 items-center gap-2">{i.amount != null && <span className="font-semibold">{formatEuros(i.amount)}</span>}<Badge tone={i.badge.tone}>{i.badge.label}</Badge></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}



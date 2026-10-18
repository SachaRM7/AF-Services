import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { formatDate, todayIso } from "../lib/format";
import { formatEuros } from "../lib/money";
import type { Client, Invoice, Quote } from "../lib/types";
import { useAsync } from "./hooks";
import { Badge, Card, Empty, ErrorBox, Field, Loading, PageHeader, SearchInput, Tabs, useAction } from "./ui";
import { INVOICE_STATUS, QUOTE_STATUS } from "./labels";
import { ClientPicker, SiteSelect } from "./pickers";
import DocumentEditor from "./DocumentEditor";

type Row<T> = T & { clients: { display_name: string } | null };

export function QuoteList() {
  const [tab, setTab] = useState<"actifs" | "brouillon" | "envoye" | "accepte" | "tous">("actifs");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useAsync(async () => {
    let query = supabase.from("quotes").select("*, clients(display_name)").order("created_at", { ascending: false }).limit(300);
    if (tab === "actifs") query = query.in("status", ["brouillon", "envoye", "accepte"]);
    else if (tab !== "tous") query = query.eq("status", tab);
    return (await must(query)) as Row<Quote>[];
  }, [tab]);
  const rows = (data ?? []).filter((r) => !q || `${r.number ?? ""} ${r.title} ${r.clients?.display_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const today = todayIso();
  return (
    <>
      <PageHeader title="Devis" actions={<Link to="/admin/devis/nouveau" className="btn-primary btn-sm"><Plus className="h-4 w-4" /> Nouveau devis</Link>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "actifs", label: "En cours" }, { value: "brouillon", label: "Brouillons" }, { value: "envoye", label: "En attente" }, { value: "accepte", label: "Acceptés" }, { value: "tous", label: "Tous" }]} />
        <SearchInput value={q} onChange={setQ} placeholder="N°, client, objet…" />
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <Loading />}
      {!loading && rows.length === 0 && <Empty title="Aucun devis" />}
      <DocTable
        rows={rows.map((r) => ({
          id: r.id, to: `/admin/devis/${r.id}`, number: r.number ? `${r.number}` : "Brouillon", client: r.clients?.display_name ?? "—", title: r.title,
          date: r.issue_date ?? r.created_at, amount: r.total_ttc_cents, sim: r.is_simulation && r.status !== "brouillon",
          badge: r.status === "envoye" && r.valid_until && r.valid_until < today ? { label: "Validité dépassée", tone: "bad" as const } : QUOTE_STATUS[r.status],
        }))}
      />
    </>
  );
}

export function InvoiceList() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"impayees" | "brouillon" | "toutes" | "avoirs">(params.get("filtre") === "impayees" ? "impayees" : "toutes");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useAsync(async () => {
    let query = supabase.from("invoices").select("*, clients(display_name)").order("created_at", { ascending: false }).limit(300);
    if (tab === "impayees") query = query.in("status", ["emise", "partiellement_payee"]).eq("kind", "facture");
    if (tab === "brouillon") query = query.eq("status", "brouillon");
    if (tab === "avoirs") query = query.eq("kind", "avoir");
    return (await must(query)) as Row<Invoice>[];
  }, [tab]);
  const rows = (data ?? []).filter((r) => !q || `${r.number ?? ""} ${r.title} ${r.clients?.display_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const today = todayIso();
  return (
    <>
      <PageHeader title="Factures" actions={<Link to="/admin/factures/nouvelle" className="btn-primary btn-sm"><Plus className="h-4 w-4" /> Nouvelle facture</Link>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "toutes", label: "Toutes" }, { value: "impayees", label: "Impayées" }, { value: "brouillon", label: "Brouillons" }, { value: "avoirs", label: "Avoirs" }]} />
        <SearchInput value={q} onChange={setQ} placeholder="N°, client…" />
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <Loading />}
      {!loading && rows.length === 0 && <Empty title="Aucune facture" />}
      <DocTable
        rows={rows.map((r) => {
          const overdue = r.kind === "facture" && ["emise", "partiellement_payee"].includes(r.status) && r.due_date && r.due_date < today;
          return {
            id: r.id, to: `/admin/factures/${r.id}`, number: `${r.kind === "avoir" ? "Avoir " : ""}${r.number ?? "Brouillon"}`, client: r.clients?.display_name ?? "—",
            title: r.title, date: r.issue_date ?? r.created_at, amount: (r.kind === "avoir" ? -1 : 1) * Number(r.total_ttc_cents), sim: r.is_simulation && r.status !== "brouillon",
            badge: overdue ? { label: "En retard", tone: "bad" as const } : INVOICE_STATUS[r.status],
          };
        })}
      />
    </>
  );
}

function DocTable({ rows }: { rows: { id: string; to: string; number: string; client: string; title: string; date: string; amount: number; sim: boolean; badge: { label: string; tone: "neutral" | "dark" | "info" | "ok" | "warn" | "bad" | "muted" } }[] }) {
  if (!rows.length) return null;
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-stone/20">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={r.to} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-paper sm:grid-cols-[10rem_1fr_7rem_8rem_10rem]">
              <span className="font-semibold">{r.number}{r.sim && <span className="ml-1 text-xs font-normal text-amber-900">(sim.)</span>}</span>
              <span className="order-3 col-span-2 min-w-0 truncate text-sm text-ink-muted sm:order-none sm:col-span-1 sm:text-ink">{r.client}{r.title && <span className="text-ink-muted"> · {r.title}</span>}</span>
              <span className="hidden text-sm text-ink-muted sm:block">{formatDate(r.date)}</span>
              <span className="text-right font-semibold">{formatEuros(r.amount)}</span>
              <span className="order-4 sm:order-none sm:text-right"><Badge tone={r.badge.tone}>{r.badge.label}</Badge></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Création : choix du client et de l'adresse, puis ouverture de l'éditeur. */
function NewDocument({ kind }: { kind: "quote" | "invoice" }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [client, setClient] = useState<Client | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const { busy, run } = useAction();
  const preset = params.get("client");
  useAsync(async () => {
    if (preset) setClient((await must(supabase.from("clients").select("*").eq("id", preset).single())) as Client);
    return null;
  }, [preset]);

  async function create() {
    const r = await run(() =>
      kind === "quote"
        ? must(supabase.rpc("new_quote", { p_client: client!.id, p_site: siteId, p_request: null, p_diagnostic: null }))
        : must(supabase.rpc("new_invoice", { p_client: client!.id, p_site: siteId })),
    );
    if (r) nav(`${kind === "quote" ? "/admin/devis" : "/admin/factures"}/${r}`, { replace: true });
  }

  return (
    <>
      <PageHeader back={kind === "quote" ? "/admin/devis" : "/admin/factures"} title={kind === "quote" ? "Nouveau devis" : "Nouvelle facture"} subtitle={kind === "invoice" ? "Facture manuelle. Pour facturer un devis accepté, ouvrez le devis." : undefined} />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client"><ClientPicker value={client?.id ?? null} onChange={(c) => { setClient(c); setSiteId(null); }} /></Field>
          <Field label="Adresse d'intervention"><SiteSelect clientId={client?.id ?? null} value={siteId} onChange={(s) => setSiteId(s?.id ?? null)} /></Field>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!client || busy} onClick={create}>Continuer</button>
          <Link to="/admin/clients/nouveau" className="btn-ghost">Créer un client</Link>
        </div>
      </Card>
    </>
  );
}

export function QuotePage() {
  const { id } = useParams();
  return id === "nouveau" || !id ? <NewDocument kind="quote" /> : <DocumentEditor key={id} kind="quote" id={id} />;
}

export function InvoicePage() {
  const { id } = useParams();
  return id === "nouvelle" || !id ? <NewDocument kind="invoice" /> : <DocumentEditor key={id} kind="invoice" id={id} />;
}

import { Link } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { formatEuros } from "../lib/money";
import { formatDate, formatDateTime, formatTime, todayIso } from "../lib/format";
import type { AuditEntry, Intervention, Invoice, RequestRow } from "../lib/types";
import { useAsync } from "./hooks";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Stat } from "./ui";
import { INTERVENTION_STATUS, REQUEST_STATUS } from "./labels";
import { useSettings } from "./settingsStore";
import { describeAudit } from "./Journal";

export default function Dashboard() {
  const { settings } = useSettings();
  const sim = settings?.mode !== "exploitation";
  const { data, error, loading, reload } = useAsync(async () => {
    const today = todayIso();
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const monthStart = `${today.slice(0, 7)}-01`;
    const in7 = new Date(Date.now() + 7 * 864e5).toISOString();
    const [requests, quotes, interventions, invoices, payments, clients, audit] = await Promise.all([
      must(supabase.from("requests").select("*").in("status", ["nouvelle", "a_qualifier", "diagnostic_necessaire"]).order("created_at", { ascending: false })),
      must(supabase.from("quotes").select("id,status,total_ttc_cents,is_simulation").in("status", ["brouillon", "envoye"])),
      must(supabase.from("interventions").select("*, clients(display_name)").gte("starts_at", new Date().toISOString().slice(0, 10)).lte("starts_at", in7).neq("status", "annulee").order("starts_at")),
      must(supabase.from("invoices").select("id,number,kind,status,total_ht_cents,total_ttc_cents,paid_cents,credited_cents,issue_date,due_date,is_simulation,client_id,clients(display_name)").neq("status", "brouillon").eq("is_simulation", sim).gte("issue_date", yearStart)),
      must(supabase.from("payments").select("amount_cents,paid_on,invoices!inner(is_simulation)").eq("invoices.is_simulation", sim).gte("paid_on", yearStart)),
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("archived", false).then((r) => r.count ?? 0),
      must(supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(8)),
    ]);
    const inv = invoices as (Invoice & { clients: { display_name: string } | null })[];
    const sign = (i: Invoice) => (i.kind === "avoir" ? -1 : 1);
    const billed = (from: string) => inv.filter((i) => (i.issue_date ?? "") >= from).reduce((a, i) => a + sign(i) * Number(i.total_ht_cents), 0);
    const pays = payments as { amount_cents: number; paid_on: string }[];
    const cashed = (from: string) => pays.filter((p) => p.paid_on >= from).reduce((a, p) => a + Number(p.amount_cents), 0);
    const unpaid = inv.filter((i) => i.kind === "facture" && (i.status === "emise" || i.status === "partiellement_payee"));
    return {
      requests: requests as RequestRow[],
      quotesDraft: (quotes as { status: string }[]).filter((q) => q.status === "brouillon").length,
      quotesSent: (quotes as { status: string }[]).filter((q) => q.status === "envoye").length,
      interventions: interventions as (Intervention & { clients: { display_name: string } | null })[],
      unpaid,
      unpaidTotal: unpaid.reduce((a, i) => a + Number(i.total_ttc_cents) - Number(i.paid_cents) - Number(i.credited_cents), 0),
      overdue: unpaid.filter((i) => i.due_date && i.due_date < today).length,
      billedMonth: billed(monthStart),
      billedYear: billed(yearStart),
      cashedMonth: cashed(monthStart),
      cashedYear: cashed(yearStart),
      clients,
      audit: audit as AuditEntry[],
    };
  }, [sim]);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={formatDate(todayIso(), { dateStyle: "full" })}
        actions={
          <>
            <Link to="/admin/diagnostics/nouveau" className="btn-secondary btn-sm"><Plus className="h-4 w-4" /> Diagnostic</Link>
            <Link to="/admin/devis/nouveau" className="btn-primary btn-sm"><Plus className="h-4 w-4" /> Devis</Link>
          </>
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Demandes à traiter" value={data.requests.length} hint={`${data.requests.filter((r) => r.status === "nouvelle").length} nouvelle(s)`} to="/admin/demandes" />
            <Stat label="Devis" value={`${data.quotesDraft} / ${data.quotesSent}`} hint="en préparation / en attente" to="/admin/devis" />
            <Stat label="Impayés" value={formatEuros(data.unpaidTotal)} hint={`${data.unpaid.length} facture(s)${data.overdue ? ` · ${data.overdue} en retard` : ""}`} to="/admin/factures?filtre=impayees" />
            <Stat label="Clients actifs" value={data.clients ?? "—"} to="/admin/clients" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Facturé HT — mois" value={formatEuros(data.billedMonth)} hint={sim ? "simulations" : undefined} />
            <Stat label="Encaissé — mois" value={formatEuros(data.cashedMonth)} />
            <Stat label="Facturé HT — année" value={formatEuros(data.billedYear)} />
            <Stat label="Encaissé — année" value={formatEuros(data.cashedYear)} to="/admin/finances" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Demandes à traiter" actions={<Link to="/admin/demandes" className="text-sm underline">Tout voir</Link>}>
              {data.requests.length === 0 ? (
                <Empty title="Aucune demande en attente" />
              ) : (
                <ul className="-my-2 divide-y divide-stone/20">
                  {data.requests.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <Link to={`/admin/demandes/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.company_name || `${r.first_name} ${r.last_name}`}</span>
                          <span className="block truncate text-xs text-ink-muted">{r.city || "—"} · {formatDateTime(r.created_at)}</span>
                        </span>
                        <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Interventions — 7 prochains jours" actions={<Link to="/admin/planning" className="text-sm underline">Planning</Link>}>
              {data.interventions.length === 0 ? (
                <Empty title="Aucune intervention planifiée" />
              ) : (
                <ul className="-my-2 divide-y divide-stone/20">
                  {data.interventions.map((i) => (
                    <li key={i.id}>
                      <Link to={`/admin/interventions/${i.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{i.clients?.display_name ?? i.title}</span>
                          <span className="block text-xs text-ink-muted">{formatDate(i.starts_at, { weekday: "short", day: "numeric", month: "short" })} · {formatTime(i.starts_at)}{i.title ? ` · ${i.title}` : ""}</span>
                        </span>
                        <Badge tone={INTERVENTION_STATUS[i.status].tone}>{INTERVENTION_STATUS[i.status].label}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Factures impayées" actions={<Link to="/admin/factures?filtre=impayees" className="text-sm underline">Tout voir</Link>}>
              {data.unpaid.length === 0 ? (
                <Empty title="Aucune facture impayée" />
              ) : (
                <ul className="-my-2 divide-y divide-stone/20">
                  {data.unpaid.slice(0, 6).map((i) => (
                    <li key={i.id}>
                      <Link to={`/admin/factures/${i.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{i.number} · {(i as unknown as { clients: { display_name: string } | null }).clients?.display_name}</span>
                          <span className="block text-xs text-ink-muted">Échéance {formatDate(i.due_date)}</span>
                        </span>
                        <span className={i.due_date && i.due_date < todayIso() ? "font-semibold text-red-900" : "font-semibold"}>
                          {formatEuros(Number(i.total_ttc_cents) - Number(i.paid_cents) - Number(i.credited_cents))}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Actions récentes" actions={<Link to="/admin/journal" className="text-sm underline">Journal</Link>}>
              <ul className="-my-1 space-y-2 text-sm">
                {data.audit.map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <span className="w-28 shrink-0 text-xs text-ink-muted">{formatDateTime(a.at)}</span>
                    <span className="min-w-0 flex-1 truncate">{describeAudit(a)}</span>
                  </li>
                ))}
              </ul>
              <Link to="/admin/journal" className="mt-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">Historique complet <ArrowRight className="h-3 w-3" /></Link>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

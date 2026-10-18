import { useState } from "react";
import { must, supabase } from "../lib/supabase";
import { formatDateTime } from "../lib/format";
import type { AuditEntry } from "../lib/types";
import { useAsync } from "./hooks";
import { Empty, ErrorBox, Loading, PageHeader } from "./ui";

const TABLES: Record<string, string> = {
  clients: "Client", sites: "Adresse", requests: "Demande", diagnostics: "Diagnostic", quotes: "Devis",
  invoices: "Facture", payments: "Règlement", interventions: "Intervention", recurrences: "Récurrence",
  services: "Prestation", service_categories: "Catégorie", company_settings: "Paramètres", travel_bands: "Tranche de déplacement",
  expenses: "Dépense", profiles: "Administrateur",
};
const ACTIONS: Record<string, string> = { insert: "création", update: "modification", delete: "suppression" };

export function describeAudit(a: AuditEntry): string {
  const who = a.actor_email ? a.actor_email.split("@")[0] : "système";
  const changes = a.action === "update" && a.changes ? Object.keys(a.changes) : [];
  const statusChange = a.changes && "status" in a.changes ? (a.changes.status as [string, string]) : null;
  const what = `${TABLES[a.table_name] ?? a.table_name}${a.summary ? ` ${a.summary}` : ""}`;
  if (statusChange) return `${who} · ${what} : ${statusChange[0]} → ${statusChange[1]}`;
  return `${who} · ${ACTIONS[a.action] ?? a.action} ${what}${changes.length ? ` (${changes.slice(0, 3).join(", ")}${changes.length > 3 ? "…" : ""})` : ""}`;
}

export default function Journal() {
  const [table, setTable] = useState("");
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAsync(async () => {
    let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).range(page * 50, page * 50 + 49);
    if (table) q = q.eq("table_name", table);
    return (await must(q)) as AuditEntry[];
  }, [table, page]);

  return (
    <>
      <PageHeader title="Journal des actions" subtitle="Traçabilité des modifications importantes (lecture seule)." />
      <select className="input mb-4 max-w-xs" value={table} onChange={(e) => { setTable(e.target.value); setPage(0); }}>
        <option value="">Tous les éléments</option>
        {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <Loading />}
      {data && data.length === 0 && <Empty title="Aucune entrée" />}
      {data && data.length > 0 && (
        <div className="card divide-y divide-stone/20">
          {data.map((a) => (
            <details key={a.id} className="px-4 py-3 text-sm">
              <summary className="flex cursor-pointer list-none flex-col gap-0.5 sm:flex-row sm:gap-4">
                <span className="w-40 shrink-0 text-xs text-ink-muted">{formatDateTime(a.at)}</span>
                <span>{describeAudit(a)}</span>
              </summary>
              {a.changes && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-paper p-3 text-xs">{JSON.stringify(a.changes, null, 2)}</pre>
              )}
            </details>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</button>
        <button className="btn-ghost btn-sm" disabled={!data || data.length < 50} onClick={() => setPage((p) => p + 1)}>Suivant</button>
      </div>
    </>
  );
}

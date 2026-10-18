import { useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { formatDate, minutesLabel, todayIso } from "../lib/format";
import { centsToInput, formatEuros, parseEuros } from "../lib/money";
import type { Expense, Invoice } from "../lib/types";
import { useAsync } from "./hooks";
import { Card, ErrorBox, Field, Loading, Modal, PageHeader, Stat, Tabs, useAction, useConfirm } from "./ui";
import { EXPENSE_CATEGORIES } from "./labels";
import { useSettings } from "./settingsStore";

type InvRow = Invoice & { clients: { display_name: string } | null; invoice_lines: { label: string; service_id: string | null; kind: string; total_ht_cents: number }[] };

function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
}

export default function Finance() {
  const { settings } = useSettings();
  const year = Number(todayIso().slice(0, 4));
  const [period, setPeriod] = useState<string>(String(year));
  const [simulation, setSimulation] = useState<boolean | null>(null);
  const sim = simulation ?? settings?.mode !== "exploitation";
  const [expModal, setExpModal] = useState(false);
  const confirm = useConfirm();
  const { run } = useAction();

  const from = period.length === 4 ? `${period}-01-01` : `${period}-01`;
  const to = period.length === 4 ? `${Number(period) + 1}-01-01` : (() => { const [y, m] = period.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; })();

  const { data, error, loading, reload } = useAsync(async () => {
    const [invoices, payments, interventions, expenses, unpaid] = await Promise.all([
      must(supabase.from("invoices").select("*, clients(display_name), invoice_lines(label, service_id, kind, total_ht_cents)").neq("status", "brouillon").eq("is_simulation", sim).gte("issue_date", from).lt("issue_date", to).order("issue_date")),
      must(supabase.from("payments").select("amount_cents, paid_on, invoices!inner(is_simulation)").eq("invoices.is_simulation", sim).gte("paid_on", from).lt("paid_on", to)),
      must(supabase.from("interventions").select("id, status, estimated_minutes, actual_minutes, invoice_id, starts_at").gte("starts_at", from).lt("starts_at", to)),
      must(supabase.from("expenses").select("*").gte("spent_on", from).lt("spent_on", to).order("spent_on", { ascending: false })),
      must(supabase.from("invoices").select("total_ttc_cents, paid_cents, credited_cents").eq("kind", "facture").eq("is_simulation", sim).in("status", ["emise", "partiellement_payee"])),
    ]);
    return {
      invoices: invoices as InvRow[],
      payments: payments as { amount_cents: number }[],
      interventions: interventions as { id: string; status: string; estimated_minutes: number | null; actual_minutes: number | null; invoice_id: string | null }[],
      expenses: expenses as Expense[],
      unpaid: (unpaid as { total_ttc_cents: number; paid_cents: number; credited_cents: number }[]).reduce((a, i) => a + Number(i.total_ttc_cents) - Number(i.paid_cents) - Number(i.credited_cents), 0),
    };
  }, [from, to, sim]);

  const periods = [String(year), String(year - 1), ...Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`)];

  let content = null;
  if (data) {
    const sign = (i: Invoice) => (i.kind === "avoir" ? -1 : 1);
    const billedHt = data.invoices.reduce((a, i) => a + sign(i) * Number(i.total_ht_cents), 0);
    const billedTtc = data.invoices.reduce((a, i) => a + sign(i) * Number(i.total_ttc_cents), 0);
    const travel = data.invoices.reduce((a, i) => a + sign(i) * Number(i.travel_billed_cents), 0);
    const cashed = data.payments.reduce((a, p) => a + Number(p.amount_cents), 0);
    const expensesHt = data.expenses.reduce((a, e) => a + Number(e.amount_ht_cents), 0);
    const done = data.interventions.filter((i) => i.status === "terminee");
    const actual = done.reduce((a, i) => a + (i.actual_minutes ?? 0), 0);
    const estimated = done.reduce((a, i) => a + (i.estimated_minutes ?? 0), 0);

    const services = new Map<string, { count: number; amount: number }>();
    data.invoices.forEach((i) => i.invoice_lines.filter((l) => l.kind === "service").forEach((l) => {
      const cur = services.get(l.label) ?? { count: 0, amount: 0 };
      services.set(l.label, { count: cur.count + sign(i), amount: cur.amount + sign(i) * Number(l.total_ht_cents) });
    }));
    const topServices = [...services.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 8);

    const perJob = data.invoices.filter((i) => i.kind === "facture").map((i) => {
      const its = data.interventions.filter((x) => x.invoice_id === i.id);
      const minutes = its.reduce((a, x) => a + (x.actual_minutes ?? x.estimated_minutes ?? 0), 0);
      const costs = data.expenses.filter((e) => its.some((x) => x.id === e.intervention_id)).reduce((a, e) => a + Number(e.amount_ht_cents), 0);
      const net = Number(i.total_ht_cents) - Number(i.travel_billed_cents) - costs;
      return { i, minutes, costs, net, hourly: minutes ? Math.round((net * 60) / minutes) : null };
    });

    const byCat = Object.keys(EXPENSE_CATEGORIES).map((k) => [k, data.expenses.filter((e) => e.category === k).reduce((a, e) => a + Number(e.amount_ht_cents), 0)] as const).filter(([, v]) => v > 0);

    const exportCsv = () => {
      const rows: (string | number)[][] = [["Numéro", "Type", "Date", "Client", "Total HT", "TVA", "Total TTC", "Réglé", "Statut"]];
      data.invoices.forEach((i) => rows.push([i.number ?? "", i.kind, i.issue_date ?? "", i.clients?.display_name ?? "", centsToInput(sign(i) * Number(i.total_ht_cents)), centsToInput(sign(i) * Number(i.total_vat_cents)), centsToInput(sign(i) * Number(i.total_ttc_cents)), centsToInput(Number(i.paid_cents)), i.status]));
      const blob = new Blob(["﻿" + csv(rows)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `factures-${period}${sim ? "-simulation" : ""}.csv`;
      a.click();
    };

    content = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Chiffre d'affaires HT" value={formatEuros(billedHt)} hint={`${formatEuros(billedTtc)} TTC facturés (avoirs déduits)`} />
          <Stat label="Encaissé" value={formatEuros(cashed)} hint="Règlements reçus sur la période" />
          <Stat label="Impayés (à date)" value={formatEuros(data.unpaid)} hint="Toutes périodes" />
          <Stat label="Déplacements facturés" value={formatEuros(travel)} hint="HT" />
          <Stat label="Interventions terminées" value={done.length} hint={`${data.interventions.length} planifiées sur la période`} />
          <Stat label="Temps réalisé" value={minutesLabel(actual)} hint={`Estimé : ${minutesLabel(estimated)}`} />
          <Stat label="Dépenses HT" value={formatEuros(expensesHt)} />
          <Stat label="CA HT − dépenses" value={formatEuros(billedHt - expensesHt)} hint="Indicatif, hors cotisations et impôts" />
        </div>
        <p className="rounded-xl bg-white p-3 text-xs text-ink-muted">
          Chiffre d'affaires (facturé), trésorerie (encaissé) et bénéfice sont des notions distinctes. Ces indicateurs sont des aides au pilotage et ne remplacent pas une comptabilité réglementaire.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Prestations les plus facturées">
            {topServices.length === 0 ? <p className="text-sm text-ink-muted">Aucune donnée.</p> : (
              <table className="table-base">
                <thead><tr><th>Prestation</th><th className="text-right">Lignes</th><th className="text-right">HT</th></tr></thead>
                <tbody>{topServices.map(([label, v]) => <tr key={label}><td>{label}</td><td className="text-right">{v.count}</td><td className="text-right">{formatEuros(v.amount)}</td></tr>)}</tbody>
              </table>
            )}
          </Card>
          <Card title="Dépenses" actions={<button className="btn-secondary btn-sm" onClick={() => setExpModal(true)}><Plus className="h-4 w-4" /> Dépense</button>}>
            {byCat.length > 0 && <p className="mb-3 text-sm">{byCat.map(([k, v]) => `${EXPENSE_CATEGORIES[k as keyof typeof EXPENSE_CATEGORIES]} : ${formatEuros(v)}`).join(" · ")}</p>}
            {data.expenses.length === 0 ? <p className="text-sm text-ink-muted">Aucune dépense saisie.</p> : (
              <ul className="divide-y divide-stone/20 text-sm">
                {data.expenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate">{formatDate(e.spent_on)} · {e.label} <span className="text-ink-muted">({EXPENSE_CATEGORIES[e.category]})</span></span>
                    <span className="flex items-center gap-2 font-semibold">{formatEuros(e.amount_ht_cents)}
                      <button className="btn-ghost btn-sm px-2" aria-label="Supprimer" onClick={async () => { if (await confirm({ title: "Supprimer cette dépense ?", danger: true })) { await run(() => must(supabase.from("expenses").delete().eq("id", e.id))); reload(); } }}><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Rentabilité estimée par chantier" actions={<button className="btn-ghost btn-sm" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</button>}>
          {perJob.length === 0 ? <p className="text-sm text-ink-muted">Aucune facture sur la période.</p> : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="table-base min-w-[36rem]">
                <thead><tr><th>Facture</th><th>Client</th><th className="text-right">HT hors dépl.</th><th className="text-right">Dépenses</th><th className="text-right">Temps</th><th className="text-right">€ / h</th></tr></thead>
                <tbody>
                  {perJob.map(({ i, minutes, costs, net, hourly }) => (
                    <tr key={i.id}>
                      <td>{i.number}</td><td>{i.clients?.display_name}</td>
                      <td className="text-right">{formatEuros(Number(i.total_ht_cents) - Number(i.travel_billed_cents))}</td>
                      <td className="text-right">{formatEuros(costs)}</td>
                      <td className="text-right">{minutesLabel(minutes)}</td>
                      <td className="text-right font-semibold">{hourly != null ? formatEuros(hourly) : <span title={`Net ${formatEuros(net)} — aucune intervention liée`}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-ink-muted">Temps issu des interventions liées à la facture (réalisé, sinon estimé). Dépenses : celles rattachées à ces interventions.</p>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Finances" subtitle="Suivi de l'activité." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {periods.map((p) => <option key={p} value={p}>{p.length === 4 ? `Année ${p}` : formatDate(`${p}-01`, { month: "long", year: "numeric" })}</option>)}
        </select>
        <Tabs value={sim ? "sim" : "real"} onChange={(v) => setSimulation(v === "sim")} tabs={[{ value: "real", label: "Documents réels" }, { value: "sim", label: "Simulations" }]} />
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {content}
      <ExpenseModal open={expModal} onClose={() => setExpModal(false)} onSaved={() => { setExpModal(false); reload(); }} />
    </>
  );
}

function ExpenseModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ spent_on: todayIso(), category: "produits", label: "", amount: "", vat: "", notes: "" });
  const { busy, run } = useAction();
  return (
    <Modal open={open} onClose={onClose} title="Nouvelle dépense" footer={<><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy || !f.label || !f.amount} onClick={async () => {
      const ok = await run(async () => {
        await must(supabase.from("expenses").insert({ spent_on: f.spent_on, category: f.category, label: f.label, amount_ht_cents: Math.abs(parseEuros(f.amount)), vat_cents: f.vat ? Math.abs(parseEuros(f.vat)) : 0, notes: f.notes }));
        return true;
      }, "Dépense enregistrée");
      if (ok) { setF({ ...f, label: "", amount: "", vat: "", notes: "" }); onSaved(); }
    }}>Enregistrer</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date"><input type="date" className="input" value={f.spent_on} onChange={(e) => setF({ ...f, spent_on: e.target.value })} /></Field>
        <Field label="Catégorie">
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Libellé" className="sm:col-span-2"><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label="Montant HT (€)"><input inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="TVA (€)"><input inputMode="decimal" className="input" value={f.vat} onChange={(e) => setF({ ...f, vat: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

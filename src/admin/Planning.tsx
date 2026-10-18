import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, MapPin, Play, Plus, Receipt, Repeat, Square, Trash2 } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { addDaysIso, cx, formatDate, formatTime, minutesLabel, todayIso } from "../lib/format";
import type { Intervention, Quote, Recurrence, Site } from "../lib/types";
import { useAsync, useUnsavedWarning } from "./hooks";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, useAction, useConfirm } from "./ui";
import { INTERVENTION_STATUS, RECURRENCE_RULES } from "./labels";
import { ClientPicker, SiteSelect } from "./pickers";
import { Attachments } from "./Attachments";

type Row = Intervention & { clients: { display_name: string } | null; sites: Pick<Site, "address_line1" | "city"> | null };

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  return addDaysIso(iso, -day);
}

/** Convertit date + heure locales (Europe/Paris) en ISO UTC. */
function parisToIso(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(guess)
      .map((p) => [p.type, Number(p.value)]),
  );
  const parisWall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess.getTime() - (parisWall - guess.getTime())).toISOString();
}

function isoToParis(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: todayIso(), time: "09:00" };
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d),
    time: new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d),
  };
}

export function PlanningPage() {
  const [params] = useSearchParams();
  const [week, setWeek] = useState(mondayOf(todayIso()));
  const [recModal, setRecModal] = useState(params.get("recurrence") === "1");
  const end = addDaysIso(week, 7);
  const { data, error, loading, reload } = useAsync(async () => {
    const [rows, recs] = await Promise.all([
      must(supabase.from("interventions").select("*, clients(display_name), sites(address_line1, city)").gte("starts_at", parisToIso(week, "00:00")).lt("starts_at", parisToIso(end, "00:00")).order("starts_at")),
      must(supabase.from("recurrences").select("*, clients(display_name)").eq("active", true).order("created_at")),
    ]);
    return { rows: rows as Row[], recs: recs as (Recurrence & { clients: { display_name: string } | null })[] };
  }, [week]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysIso(week, i)), [week]);
  const today = todayIso();

  return (
    <>
      <PageHeader
        title="Planning"
        actions={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setRecModal(true)}><Repeat className="h-4 w-4" /> Récurrence</button>
            <Link to="/admin/interventions/nouvelle" className="btn-primary btn-sm"><Plus className="h-4 w-4" /> Intervention</Link>
          </>
        }
      />
      <div className="mb-4 flex items-center justify-between gap-2">
        <button className="btn-ghost btn-sm" onClick={() => setWeek(addDaysIso(week, -7))} aria-label="Semaine précédente"><ChevronLeft className="h-4 w-4" /></button>
        <div className="text-center">
          <p className="font-semibold">Semaine du {formatDate(week, { day: "numeric", month: "long" })}</p>
          {week !== mondayOf(today) && <button className="text-xs underline" onClick={() => setWeek(mondayOf(today))}>Revenir à aujourd'hui</button>}
        </div>
        <button className="btn-ghost btn-sm" onClick={() => setWeek(addDaysIso(week, 7))} aria-label="Semaine suivante"><ChevronRight className="h-4 w-4" /></button>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-3">
          {days.map((d) => {
            const items = data.rows.filter((r) => isoToParis(r.starts_at).date === d);
            return (
              <section key={d} className={cx("card p-3 sm:p-4", d === today && "border-ink")}>
                <h2 className={cx("mb-2 text-sm font-bold capitalize", d === today ? "text-ink" : "text-ink-muted")}>
                  {formatDate(d, { weekday: "long", day: "numeric", month: "long" })}{d === today && " · aujourd'hui"}
                </h2>
                {items.length === 0 ? <p className="text-xs text-ink-muted">—</p> : (
                  <ul className="space-y-2">
                    {items.map((i) => (
                      <li key={i.id}>
                        <Link to={`/admin/interventions/${i.id}`} className={cx("flex items-start justify-between gap-3 rounded-lg border border-stone/30 p-3 hover:border-ink", i.status === "annulee" && "opacity-50")}>
                          <div className="min-w-0">
                            <p className="font-semibold"><Clock className="mr-1 inline h-3.5 w-3.5" />{formatTime(i.starts_at)}{i.ends_at && `–${formatTime(i.ends_at)}`} · {i.clients?.display_name ?? "—"}</p>
                            {i.title && <p className="truncate text-sm">{i.title}</p>}
                            {i.sites && <p className="truncate text-xs text-ink-muted"><MapPin className="mr-1 inline h-3 w-3" />{i.sites.address_line1}, {i.sites.city}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge tone={INTERVENTION_STATUS[i.status].tone}>{INTERVENTION_STATUS[i.status].label}</Badge>
                            {i.recurrence_id && <Repeat className="h-3.5 w-3.5 text-ink-muted" aria-label="Récurrente" />}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <Card title="Récurrences actives">
            {data.recs.length === 0 ? <p className="text-sm text-ink-muted">Aucune récurrence.</p> : (
              <ul className="divide-y divide-stone/20 text-sm">
                {data.recs.map((r) => <RecurrenceRow key={r.id} r={r} onChange={reload} />)}
              </ul>
            )}
          </Card>
        </div>
      )}
      <RecurrenceModal open={recModal} quoteId={params.get("devis")} onClose={() => setRecModal(false)} onSaved={() => { setRecModal(false); reload(); }} />
    </>
  );
}

function RecurrenceRow({ r, onChange }: { r: Recurrence & { clients: { display_name: string } | null }; onChange: () => void }) {
  const { busy, run } = useAction();
  const confirm = useConfirm();
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">{r.clients?.display_name} {r.title && `· ${r.title}`}</p>
        <p className="text-xs text-ink-muted">{RECURRENCE_RULES[r.rule]} à {r.start_time.slice(0, 5)} · depuis le {formatDate(r.start_date)}{r.end_date && ` jusqu'au ${formatDate(r.end_date)}`} · {minutesLabel(r.duration_minutes)}</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" disabled={busy} onClick={async () => {
          const n = await run(() => must(supabase.rpc("generate_recurrence", { p_id: r.id, p_until: addDaysIso(todayIso(), 92) })));
          if (n !== undefined) { onChange(); }
        }}><CalendarPlus className="h-4 w-4" /> Générer 3 mois</button>
        <button className="btn-ghost btn-sm" disabled={busy} onClick={async () => {
          if (!(await confirm({ title: "Arrêter cette récurrence ?", message: "Les interventions déjà planifiées sont conservées." }))) return;
          await run(() => must(supabase.from("recurrences").update({ active: false }).eq("id", r.id)), "Récurrence arrêtée");
          onChange();
        }}>Arrêter</button>
      </div>
    </li>
  );
}

function RecurrenceModal({ open, quoteId, onClose, onSaved }: { open: boolean; quoteId: string | null; onClose: () => void; onSaved: () => void }) {
  const empty = { client_id: null as string | null, site_id: null as string | null, quote_id: quoteId, title: "", rule: "hebdomadaire" as Recurrence["rule"], start_date: todayIso(), end_date: "", start_time: "09:00", duration_minutes: 60, assignee: "", notes: "" };
  const [f, setF] = useState(empty);
  const { busy, run } = useAction();
  useEffect(() => {
    if (!open) return;
    setF({ ...empty, quote_id: quoteId });
    if (quoteId) {
      supabase.from("quotes").select("client_id, site_id, title, recurrence_text").eq("id", quoteId).single().then(({ data }) => {
        if (data) setF((x) => ({ ...x, client_id: data.client_id, site_id: data.site_id, title: data.title, notes: data.recurrence_text }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteId]);

  async function save() {
    const ok = await run(async () => {
      const rec = (await must(supabase.from("recurrences").insert({ ...f, end_date: f.end_date || null }).select("id").single())) as { id: string };
      await must(supabase.rpc("generate_recurrence", { p_id: rec.id, p_until: addDaysIso(todayIso(), 92) }));
      return true;
    }, "Récurrence créée et interventions planifiées sur 3 mois");
    if (ok) onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle récurrence" footer={<><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy || !f.client_id} onClick={save}>Créer</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" className="sm:col-span-2"><ClientPicker value={f.client_id} onChange={(c) => setF({ ...f, client_id: c?.id ?? null, site_id: null })} /></Field>
        <Field label="Adresse" className="sm:col-span-2"><SiteSelect clientId={f.client_id} value={f.site_id} onChange={(s) => setF({ ...f, site_id: s?.id ?? null })} /></Field>
        <Field label="Intitulé" className="sm:col-span-2"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. Vitrine boutique" /></Field>
        <Field label="Rythme">
          <select className="input" value={f.rule} onChange={(e) => setF({ ...f, rule: e.target.value as Recurrence["rule"] })}>
            {Object.entries(RECURRENCE_RULES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Heure"><input type="time" className="input" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
        <Field label="Première date"><input type="date" className="input" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="Fin (facultatif)"><input type="date" className="input" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        <Field label="Durée (min)"><input inputMode="numeric" className="input" value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></Field>
        <Field label="Intervenant"><input className="input" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

const EMPTY = {
  client_id: null as string | null, site_id: null as string | null, quote_id: null as string | null, diagnostic_id: null as string | null,
  title: "", date: todayIso(), start: "09:00", end: "10:00", assignee: "", status: "planifiee" as Intervention["status"],
  planned_services: "", estimated_minutes: "" as string, actual_minutes: "" as string, notes: "",
};

export function InterventionEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nouvelle";
  const [params] = useSearchParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { busy, run } = useAction();
  const [f, setF] = useState(EMPTY);
  const [saved, setSaved] = useState("");
  const [row, setRow] = useState<Intervention | null>(null);

  const { error, loading, reload } = useAsync(async () => {
    if (isNew) {
      const base = { ...EMPTY, client_id: params.get("client") };
      const quoteId = params.get("devis");
      if (quoteId) {
        const q = (await must(supabase.from("quotes").select("*").eq("id", quoteId).single())) as Quote;
        const lines = (await must(supabase.from("quote_lines").select("label, quantity, unit, kind").eq("quote_id", quoteId).order("position"))) as { label: string; quantity: number; unit: string; kind: string }[];
        Object.assign(base, {
          client_id: q.client_id, site_id: q.site_id, quote_id: q.id, diagnostic_id: q.diagnostic_id, title: q.title,
          planned_services: lines.filter((l) => l.kind === "service").map((l) => `${l.label} (${Number(l.quantity)} ${l.unit})`).join("\n"),
        });
      }
      setF(base);
      setSaved(JSON.stringify(base));
      setRow(null);
      return null;
    }
    const r = (await must(supabase.from("interventions").select("*").eq("id", id).single())) as Intervention;
    const s = isoToParis(r.starts_at);
    const e = r.ends_at ? isoToParis(r.ends_at) : null;
    const v = {
      client_id: r.client_id, site_id: r.site_id, quote_id: r.quote_id, diagnostic_id: r.diagnostic_id, title: r.title, date: s.date, start: s.time,
      end: e?.time ?? "", assignee: r.assignee, status: r.status, planned_services: r.planned_services,
      estimated_minutes: r.estimated_minutes?.toString() ?? "", actual_minutes: r.actual_minutes?.toString() ?? "", notes: r.notes,
    };
    setF(v);
    setSaved(JSON.stringify(v));
    setRow(r);
    return null;
  }, [id]);

  const dirty = saved !== "" && JSON.stringify(f) !== saved;
  useUnsavedWarning(dirty);

  async function save(patch: Partial<typeof f> = {}) {
    const v = { ...f, ...patch };
    const payload = {
      client_id: v.client_id, site_id: v.site_id, quote_id: v.quote_id, diagnostic_id: v.diagnostic_id, title: v.title,
      starts_at: parisToIso(v.date, v.start), ends_at: v.end ? parisToIso(v.date, v.end) : null, assignee: v.assignee, status: v.status,
      planned_services: v.planned_services, estimated_minutes: v.estimated_minutes ? Number(v.estimated_minutes) : null,
      actual_minutes: v.actual_minutes ? Number(v.actual_minutes) : null, notes: v.notes,
    };
    if (payload.ends_at && payload.ends_at < payload.starts_at) {
      return run(async () => { throw new Error("L'heure de fin précède l'heure de début."); });
    }
    const r = await run(
      () => (isNew ? must(supabase.from("interventions").insert(payload).select().single()) : must(supabase.from("interventions").update(payload).eq("id", id).select().single())),
      "Intervention enregistrée",
    );
    if (r) {
      setF(v);
      setSaved(JSON.stringify(v));
      setRow(r as Intervention);
      if (isNew) nav(`/admin/interventions/${(r as Intervention).id}`, { replace: true });
    }
    return r;
  }

  async function finish() {
    const minutes = f.actual_minutes || (() => {
      const [h1, m1] = f.start.split(":").map(Number);
      const [h2, m2] = (f.end || f.start).split(":").map(Number);
      return String(Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1)) || "");
    })();
    await save({ status: "terminee", actual_minutes: minutes });
  }

  async function prepareInvoice() {
    if (dirty && !(await save())) return;
    const inv = await run(() => must(supabase.rpc("invoice_from_intervention", { p_intervention: id })), "Facture préparée");
    if (inv) nav(`/admin/factures/${inv}`);
  }

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !isNew) return <Loading />;
  const st = INTERVENTION_STATUS[f.status];

  return (
    <>
      <PageHeader
        back="/admin/planning"
        title={isNew ? "Nouvelle intervention" : f.title || "Intervention"}
        subtitle={!isNew && <><Badge tone={st.tone}>{st.label}</Badge> {formatDate(f.date, { dateStyle: "full" })}</>}
        actions={!isNew && row?.status !== "terminee" && (
          <button className="btn-ghost btn-sm" onClick={async () => {
            if (!(await confirm({ title: "Supprimer cette intervention ?", danger: true, confirmLabel: "Supprimer" }))) return;
            if (await run(() => must(supabase.from("interventions").delete().eq("id", id)), "Intervention supprimée") !== undefined) nav("/admin/planning");
          }}><Trash2 className="h-4 w-4" /></button>
        )}
      />

      {!isNew && (
        <div className="mb-5 flex flex-wrap gap-2">
          {f.status === "planifiee" && <button className="btn-primary" disabled={busy} onClick={() => save({ status: "en_cours" })}><Play className="h-4 w-4" /> Démarrer</button>}
          {(f.status === "planifiee" || f.status === "en_cours") && <button className={f.status === "en_cours" ? "btn-primary" : "btn-secondary"} disabled={busy} onClick={finish}><Square className="h-4 w-4" /> Terminer</button>}
          {f.status === "terminee" && !row?.invoice_id && <button className="btn-primary" disabled={busy} onClick={prepareInvoice}><Receipt className="h-4 w-4" /> Préparer la facture</button>}
          {row?.invoice_id && <Link className="btn-secondary" to={`/admin/factures/${row.invoice_id}`}><Receipt className="h-4 w-4" /> Voir la facture</Link>}
          {f.status !== "annulee" && f.status !== "terminee" && <button className="btn-ghost" disabled={busy} onClick={() => save({ status: "annulee" })}>Annuler l'intervention</button>}
        </div>
      )}

      <div className="space-y-5">
        <Card title="Quand et où">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client"><ClientPicker value={f.client_id} onChange={(c) => setF({ ...f, client_id: c?.id ?? null, site_id: null })} /></Field>
            <Field label="Adresse"><SiteSelect clientId={f.client_id} value={f.site_id} onChange={(s) => setF({ ...f, site_id: s?.id ?? null })} /></Field>
            <Field label="Intitulé" className="sm:col-span-2"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Date"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début"><input type="time" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
              <Field label="Fin"><input type="time" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
            </div>
            <Field label="Intervenant"><input className="input" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} placeholder="Ex. Adel" /></Field>
            <Field label="Statut">
              <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Intervention["status"] })}>
                {Object.entries(INTERVENTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
          </div>
        </Card>
        <Card title="Travail">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prestations prévues" className="sm:col-span-2"><textarea rows={3} className="input" value={f.planned_services} onChange={(e) => setF({ ...f, planned_services: e.target.value })} /></Field>
            <Field label="Temps estimé (min)"><input inputMode="numeric" className="input" value={f.estimated_minutes} onChange={(e) => setF({ ...f, estimated_minutes: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Temps réalisé (min)"><input inputMode="numeric" className="input" value={f.actual_minutes} onChange={(e) => setF({ ...f, actual_minutes: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea rows={3} className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {f.quote_id && <Link className="underline" to={`/admin/devis/${f.quote_id}`}>Devis associé</Link>}
            {f.diagnostic_id && <Link className="underline" to={`/admin/diagnostics/${f.diagnostic_id}`}>Diagnostic associé</Link>}
            {f.client_id && <Link className="underline" to={`/admin/clients/${f.client_id}`}>Fiche client</Link>}
          </div>
        </Card>
        {!isNew && (
          <Card title="Photos avant / après">
            <Attachments owner={{ intervention_id: id }} defaultPhase={f.status === "terminee" || f.status === "en_cours" ? "apres" : "avant"} />
          </Card>
        )}
      </div>

      <div className="sticky bottom-16 z-20 mt-6 flex gap-2 rounded-2xl border border-stone/40 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <button className="btn-primary btn-sm" disabled={busy || !dirty || !f.client_id} onClick={() => save()}>{dirty || isNew ? "Enregistrer" : "Enregistré"}</button>
      </div>
    </>
  );
}


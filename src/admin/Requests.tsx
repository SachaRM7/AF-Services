import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ClipboardList, FileSignature, Mail, Phone, UserPlus } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { formatDateTime, formatKm } from "../lib/format";
import { formatEuros } from "../lib/money";
import { FREQUENCIES, SERVICES } from "../lib/content";
import type { RequestRow, RequestStatus } from "../lib/types";
import { useAsync } from "./hooks";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, SearchInput, Tabs, useAction } from "./ui";
import { REQUEST_STATUS } from "./labels";
import { Attachments } from "./Attachments";
import { useSettings } from "./settingsStore";

const ZoneMap = lazy(() => import("../components/ZoneMap"));

const catName = (slug: string) => SERVICES.find((s) => s.slug === slug)?.name ?? slug;

export function RequestList() {
  const [tab, setTab] = useState<"open" | "all" | "closed">("open");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useAsync(async () => {
    let query = supabase.from("requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (tab === "open") query = query.in("status", ["nouvelle", "a_qualifier", "diagnostic_necessaire", "devis_envoye"]);
    if (tab === "closed") query = query.in("status", ["acceptee", "refusee", "cloturee"]);
    return (await must(query)) as RequestRow[];
  }, [tab]);
  const rows = (data ?? []).filter((r) => !q || `${r.first_name} ${r.last_name} ${r.company_name} ${r.email} ${r.city}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Demandes" subtitle="Demandes de devis et messages reçus depuis le site." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "open", label: "En cours" }, { value: "closed", label: "Terminées" }, { value: "all", label: "Toutes" }]} />
        <SearchInput value={q} onChange={setQ} />
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <Loading />}
      {!loading && rows.length === 0 && <Empty title="Aucune demande" />}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={`/admin/demandes/${r.id}`} className="card flex flex-col gap-2 p-4 transition hover:border-ink sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">
                  {r.company_name || `${r.first_name} ${r.last_name}`.trim()}
                  <span className="ml-2 text-xs font-normal text-ink-muted">{r.kind === "contact" ? "Message" : r.customer_type}</span>
                </p>
                <p className="truncate text-sm text-ink-muted">
                  {r.kind === "devis" ? r.category_slugs.map(catName).join(", ") : r.message.slice(0, 90)}
                </p>
                <p className="text-xs text-ink-muted">{formatDateTime(r.created_at)}{r.city ? ` · ${r.city}` : ""}{r.distance_km != null ? ` · ${formatKm(r.distance_km)}` : ""}</p>
              </div>
              <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RequestDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings, bands } = useSettings();
  const { busy, run } = useAction();
  const { data: r, error, loading, reload, setData } = useAsync(
    async () => (await must(supabase.from("requests").select("*").eq("id", id).single())) as RequestRow,
    [id],
  );
  const [notes, setNotes] = useState<string | null>(null);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !r) return <Loading />;

  const update = (patch: Partial<RequestRow>) =>
    run(async () => setData((await must(supabase.from("requests").update(patch).eq("id", r.id).select().single())) as RequestRow), "Demande mise à jour");

  const far = r.distance_km != null && settings && r.distance_km > settings.manual_review_km;

  return (
    <>
      <PageHeader
        back="/admin/demandes"
        title={r.company_name || `${r.first_name} ${r.last_name}`.trim()}
        subtitle={<>Reçue le {formatDateTime(r.created_at)} · <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge></>}
        actions={
          <>
            {!r.client_id ? (
              <button className="btn-secondary btn-sm" disabled={busy} onClick={() => run(async () => { await must(supabase.rpc("convert_request", { p_request: r.id })); await reload(); }, "Fiche client créée")}>
                <UserPlus className="h-4 w-4" /> Créer la fiche client
              </button>
            ) : (
              <Link className="btn-secondary btn-sm" to={`/admin/clients/${r.client_id}`}>Fiche client</Link>
            )}
            {r.kind === "devis" && (
              <>
                <button className="btn-secondary btn-sm" disabled={busy} onClick={async () => { const d = await run(() => must(supabase.rpc("diagnostic_from_request", { p_request: r.id }))); if (d) nav(`/admin/diagnostics/${d}`); }}>
                  <ClipboardList className="h-4 w-4" /> Diagnostic
                </button>
                <button
                  className="btn-primary btn-sm"
                  disabled={busy}
                  onClick={async () => {
                    const q = await run(async () => {
                      const client = await must(supabase.rpc("convert_request", { p_request: r.id }));
                      const { data: fresh } = await supabase.from("requests").select("site_id").eq("id", r.id).single();
                      return must(supabase.rpc("new_quote", { p_client: client, p_site: fresh?.site_id ?? null, p_request: r.id, p_diagnostic: null }));
                    });
                    if (q) nav(`/admin/devis/${q}`);
                  }}
                >
                  <FileSignature className="h-4 w-4" /> Devis direct
                </button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {r.kind === "devis" && (
            <Card title="Besoin">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2"><dt className="text-ink-muted">Prestations</dt><dd className="mt-1 flex flex-wrap gap-1">{r.category_slugs.map((s) => <Badge key={s}>{catName(s)}</Badge>)}</dd></div>
                <div><dt className="text-ink-muted">Surface</dt><dd>{r.surface_m2 != null ? `${r.surface_m2} m²` : "—"}</dd></div>
                <div><dt className="text-ink-muted">Quantité</dt><dd>{r.quantity || "—"}</dd></div>
                <div><dt className="text-ink-muted">Fréquence</dt><dd>{FREQUENCIES.find((f) => f.value === r.frequency)?.label ?? (r.frequency || "—")}</dd></div>
                <div><dt className="text-ink-muted">Dates souhaitées</dt><dd>{r.preferred_dates || "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-ink-muted">Accès</dt><dd className="whitespace-pre-line">{r.access_info || "—"}</dd></div>
              </dl>
            </Card>
          )}
          <Card title={r.kind === "contact" ? "Message" : "Observations"}>
            <p className="whitespace-pre-line text-sm">{r.message || "—"}</p>
          </Card>
          {r.kind === "devis" && (
            <Card title="Photos transmises">
              <Attachments owner={{ request_id: r.id }} canUpload={false} />
            </Card>
          )}
          <Card title="Notes internes">
            <textarea className="input" rows={4} value={notes ?? r.internal_notes} onChange={(e) => setNotes(e.target.value)} />
            {notes != null && notes !== r.internal_notes && (
              <button className="btn-primary btn-sm mt-2" disabled={busy} onClick={() => update({ internal_notes: notes }).then(() => setNotes(null))}>Enregistrer</button>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Contact">
            <ul className="space-y-2 text-sm">
              <li className="font-semibold">{`${r.first_name} ${r.last_name}`.trim()}{r.company_name && <span className="font-normal text-ink-muted"> — {r.company_name}</span>}</li>
              {r.email && <li><a href={`mailto:${r.email}`} className="inline-flex items-center gap-2 underline"><Mail className="h-4 w-4" />{r.email}</a></li>}
              {r.phone && <li><a href={`tel:${r.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 underline"><Phone className="h-4 w-4" />{r.phone}</a></li>}
            </ul>
          </Card>
          {r.kind === "devis" && (
            <Card title="Chantier">
              <p className="text-sm">{r.address_line1}<br />{r.postal_code} {r.city}</p>
              <p className="mt-2 text-sm">
                {r.distance_km != null ? <>Distance <strong>{formatKm(r.distance_km)}</strong> · déplacement <strong>{formatEuros(r.travel_fee_cents)} HT</strong></> : "Adresse non géolocalisée"}
              </p>
              {far && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900">Intervention éloignée : validation manuelle requise.</p>}
              {r.lat != null && r.lng != null && settings && (
                <Suspense fallback={null}>
                  <div className="mt-3">
                    <ZoneMap base={{ lat: settings.base_lat, lng: settings.base_lng, label: settings.base_label }} bands={bands} point={{ lat: Number(r.lat), lng: Number(r.lng), label: r.city }} className="h-56" />
                  </div>
                </Suspense>
              )}
            </Card>
          )}
          <Card title="Statut">
            <select className="input" value={r.status} disabled={busy} onChange={(e) => update({ status: e.target.value as RequestStatus })}>
              {Object.entries(REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Card>
        </div>
      </div>
    </>
  );
}

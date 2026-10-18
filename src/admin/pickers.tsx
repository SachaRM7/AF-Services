import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import type { Client, Site } from "../lib/types";
import { AddressSearch } from "../components/AddressSearch";
import { formatKm } from "../lib/format";
import { formatEuros } from "../lib/money";
import { travelFeeForKm, haversineKm } from "../lib/travel";
import { Field, Modal, useAction } from "./ui";
import { useDebounced } from "./hooks";
import { useSettings } from "./settingsStore";

export function ClientPicker({ value, onChange, disabled }: { value: string | null; onChange: (c: Client | null) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [options, setOptions] = useState<Client[]>([]);
  const [current, setCurrent] = useState<Client | null>(null);

  useEffect(() => {
    if (!value) return setCurrent(null);
    supabase.from("clients").select("*").eq("id", value).maybeSingle().then(({ data }) => setCurrent(data as Client | null));
  }, [value]);

  useEffect(() => {
    let query = supabase.from("clients").select("*").eq("archived", false).order("display_name").limit(20);
    if (dq.trim()) query = query.or(`display_name.ilike.%${dq.replace(/[%,()]/g, "")}%,email.ilike.%${dq.replace(/[%,()]/g, "")}%`);
    query.then(({ data }) => setOptions((data as Client[]) ?? []));
  }, [dq]);

  if (current && !disabled) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-stone bg-white px-3 py-2">
        <span className="truncate font-medium">{current.display_name} <span className="text-xs text-ink-muted">· {current.kind}</span></span>
        <button type="button" className="text-sm underline" onClick={() => onChange(null)}>Changer</button>
      </div>
    );
  }
  if (disabled) return <div className="rounded-lg bg-paper-deep px-3 py-2">{current?.display_name ?? "—"}</div>;
  return (
    <div>
      <input className="input" placeholder="Rechercher un client (nom, e-mail)…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-stone/40 bg-white">
        {options.map((c) => (
          <li key={c.id}>
            <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onChange(c)}>
              {c.display_name} <span className="text-ink-muted">{c.email}</span>
            </button>
          </li>
        ))}
        {!options.length && <li className="px-3 py-2 text-sm text-ink-muted">Aucun client</li>}
      </ul>
    </div>
  );
}

export function SiteSelect({ clientId, value, onChange, disabled }: { clientId: string | null; value: string | null; onChange: (s: Site | null) => void; disabled?: boolean }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [adding, setAdding] = useState(false);
  const load = () => {
    if (!clientId) return setSites([]);
    supabase.from("sites").select("*").eq("client_id", clientId).order("created_at").then(({ data }) => setSites((data as Site[]) ?? []));
  };
  useEffect(load, [clientId]);
  if (!clientId) return <p className="text-sm text-ink-muted">Choisissez d'abord un client.</p>;
  return (
    <div className="flex gap-2">
      <select
        className="input"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(sites.find((s) => s.id === e.target.value) ?? null)}
      >
        <option value="">— Aucune adresse —</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label ? `${s.label} — ` : ""}{s.address_line1}, {s.postal_code} {s.city} ({formatKm(s.distance_km)})
          </option>
        ))}
      </select>
      {!disabled && (
        <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setAdding(true)} aria-label="Nouvelle adresse"><Plus className="h-4 w-4" /></button>
      )}
      <SiteFormModal
        open={adding}
        clientId={clientId}
        onClose={() => setAdding(false)}
        onSaved={(s) => {
          setAdding(false);
          setSites((xs) => [...xs, s]);
          onChange(s);
        }}
      />
    </div>
  );
}

export function SiteFormModal({ open, clientId, site, onClose, onSaved }: { open: boolean; clientId: string; site?: Site | null; onClose: () => void; onSaved: (s: Site) => void }) {
  const { settings, bands } = useSettings();
  const empty = { label: "", address_line1: "", address_line2: "", postal_code: "", city: "", lat: null as number | null, lng: null as number | null, access_notes: "" };
  const [f, setF] = useState(empty);
  const [search, setSearch] = useState("");
  const { busy, run } = useAction();
  useEffect(() => {
    if (open) {
      setF(site ? { ...empty, ...site, lat: site.lat == null ? null : Number(site.lat), lng: site.lng == null ? null : Number(site.lng) } : empty);
      setSearch(site ? `${site.address_line1} ${site.postal_code} ${site.city}` : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, site]);

  const km = f.lat != null && f.lng != null && settings ? haversineKm(settings.base_lat, settings.base_lng, f.lat, f.lng) : null;

  async function save() {
    const payload = { ...f, client_id: clientId };
    const saved = await run(
      () =>
        site
          ? must(supabase.from("sites").update(payload).eq("id", site.id).select().single())
          : must(supabase.from("sites").insert(payload).select().single()),
      "Adresse enregistrée",
    );
    if (saved) onSaved(saved as Site);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={site ? "Modifier l'adresse" : "Nouvelle adresse d'intervention"}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={busy || !f.address_line1} onClick={save}>Enregistrer</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Rechercher l'adresse" hint="Sélectionnez une suggestion pour géolocaliser (frais de déplacement).">
          <AddressSearch
            value={search}
            onChange={setSearch}
            onSelect={(r) => setF((x) => ({ ...x, address_line1: r.street || r.label, postal_code: r.postcode, city: r.city, lat: r.lat, lng: r.lng }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Libellé (facultatif)" className="sm:col-span-2"><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Ex. Boutique centre-ville" /></Field>
          <Field label="Adresse" className="sm:col-span-2"><input className="input" value={f.address_line1} onChange={(e) => setF({ ...f, address_line1: e.target.value })} /></Field>
          <Field label="Complément" className="sm:col-span-2"><input className="input" value={f.address_line2} onChange={(e) => setF({ ...f, address_line2: e.target.value })} /></Field>
          <Field label="Code postal"><input className="input" value={f.postal_code} onChange={(e) => setF({ ...f, postal_code: e.target.value })} /></Field>
          <Field label="Ville"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Accès, digicode, stationnement" className="sm:col-span-2"><textarea rows={2} className="input" value={f.access_notes} onChange={(e) => setF({ ...f, access_notes: e.target.value })} /></Field>
        </div>
        <p className="rounded-lg bg-paper p-3 text-sm">
          {km != null ? (
            <>Distance : <strong>{formatKm(km)}</strong> · Déplacement : <strong>{formatEuros(travelFeeForKm(km, bands))} HT</strong>
              {settings && km > settings.manual_review_km && <span className="ml-1 font-semibold text-amber-900">· Éloigné : validation manuelle</span>}</>
          ) : (
            "Adresse non géolocalisée : les frais de déplacement devront être saisis manuellement."
          )}
        </p>
      </div>
    </Modal>
  );
}

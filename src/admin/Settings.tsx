import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { centsToInput, formatEuros, parseEuros } from "../lib/money";
import { formatDateTime } from "../lib/format";
import type { CompanySettings, TravelBandRow } from "../lib/types";
import { AddressSearch } from "../components/AddressSearch";
import { useAsync, useUnsavedWarning } from "./hooks";
import { Badge, Card, Field, Loading, PageHeader, Tabs, useAction, useConfirm } from "./ui";
import { VAT_REGIMES } from "./labels";
import { useSettings } from "./settingsStore";
import { useAuth } from "./auth";

const ZoneMap = lazy(() => import("../components/ZoneMap"));

type Tab = "entreprise" | "legal" | "documents" | "tarifs" | "mode" | "comptes";

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("onglet") as Tab) ?? "entreprise";
  const { settings, reload } = useSettings();
  const [f, setF] = useState<CompanySettings | null>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    if (settings) setF(settings);
  }, [settings]);
  const dirty = !!f && !!settings && JSON.stringify(f) !== JSON.stringify(settings);
  useUnsavedWarning(dirty);

  if (!f) return <Loading />;
  const set = <K extends keyof CompanySettings>(k: K) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const { id: _id, mode: _m, exploitation_since: _e, ...payload } = f!;
    await run(() => must(supabase.from("company_settings").update(payload).eq("id", 1)), "Paramètres enregistrés");
    await reload();
  }

  const text = (k: keyof CompanySettings, label: string, opts: { hint?: string; rows?: number; className?: string; placeholder?: string } = {}) => (
    <Field label={label} hint={opts.hint} className={opts.className}>
      {opts.rows ? (
        <textarea rows={opts.rows} className="input" value={String(f[k] ?? "")} onChange={set(k)} placeholder={opts.placeholder} />
      ) : (
        <input className="input" value={String(f[k] ?? "")} onChange={set(k)} placeholder={opts.placeholder} />
      )}
    </Field>
  );

  const saveBar = tab !== "mode" && tab !== "comptes" && tab !== "tarifs" && (
    <div className="sticky bottom-16 z-20 mt-6 flex gap-2 rounded-2xl border border-stone/40 bg-white/95 p-3 shadow-lg lg:bottom-4">
      <button className="btn-primary btn-sm" disabled={!dirty || busy} onClick={save}>{dirty ? "Enregistrer" : "Enregistré"}</button>
      {dirty && <button className="btn-ghost btn-sm" onClick={() => setF(settings)}>Annuler les modifications</button>}
    </div>
  );

  return (
    <>
      <PageHeader title="Paramètres" />
      <Tabs
        value={tab}
        onChange={(v) => setParams({ onglet: v })}
        tabs={[
          { value: "entreprise", label: "Entreprise" },
          { value: "legal", label: "Légal & TVA" },
          { value: "documents", label: "Paiement & documents" },
          { value: "tarifs", label: "Minimum & déplacement" },
          { value: "mode", label: "Mode" },
          { value: "comptes", label: "Comptes" },
        ]}
      />

      {tab === "entreprise" && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("trade_name", "Nom commercial")}
            {text("tagline", "Sous-titre")}
            {text("founder_name", "Dirigeant")}
            {text("website", "Site web")}
            {text("phone", "Téléphone (affiché sur le site)")}
            {text("email", "E-mail (affiché sur le site)")}
          </div>
        </Card>
      )}

      {tab === "legal" && (
        <div className="space-y-5">
          <Card title="Identité légale">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("legal_name", "Dénomination / nom légal", { hint: "Pour une entreprise individuelle : nom et prénom de l'exploitant." })}
              {text("legal_form", "Forme juridique", { placeholder: "EI, EURL, SASU…", hint: "Pour une EI, la mention « EI » doit suivre le nom sur les documents." })}
              {text("siren", "SIREN", { hint: "9 chiffres" })}
              {text("siret", "SIRET", { hint: "14 chiffres" })}
              {text("registration", "Immatriculation", { placeholder: "RCS Toulouse / RNE…" })}
              {text("ape_code", "Code APE")}
              {text("share_capital", "Capital social (société)")}
              {text("insurance_text", "Assurance professionnelle (mention)", { placeholder: "Assureur, n° de contrat, couverture géographique" })}
              {text("address_line1", "Adresse professionnelle", { className: "sm:col-span-2" })}
              {text("address_line2", "Complément", { className: "sm:col-span-2" })}
              {text("postal_code", "Code postal")}
              {text("city", "Ville")}
            </div>
          </Card>
          <Card title="TVA">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Régime de TVA" hint="Ne pas présumer de la franchise : à confirmer selon le statut choisi et le chiffre d'affaires.">
                <select className="input" value={f.vat_regime} onChange={(e) => setF({ ...f, vat_regime: e.target.value as CompanySettings["vat_regime"] })}>
                  {Object.entries(VAT_REGIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Taux par défaut">
                <select className="input" value={f.default_vat_rate_bps} onChange={(e) => setF({ ...f, default_vat_rate_bps: Number(e.target.value) })}>
                  <option value={2000}>20 %</option><option value={1000}>10 %</option><option value={550}>5,5 %</option>
                </select>
              </Field>
              {f.vat_regime === "assujetti" && text("vat_number", "N° de TVA intracommunautaire")}
              {f.vat_regime === "assujetti" && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-ink" checked={f.vat_on_debits} onChange={(e) => setF({ ...f, vat_on_debits: e.target.checked })} /> Option pour la TVA sur les débits</label>
              )}
              {f.vat_regime === "franchise" && text("franchise_mention", "Mention de franchise", { className: "sm:col-span-2" })}
            </div>
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-5">
          <Card title="Règlement">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("bank_name", "Banque")}
              {text("iban", "IBAN")}
              {text("bic", "BIC")}
              <Field label="Délai de paiement (jours)" hint="60 jours maximum (art. L441-10 du Code de commerce).">
                <input inputMode="numeric" className="input" value={f.payment_terms_days} onChange={(e) => setF({ ...f, payment_terms_days: Math.min(60, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
              </Field>
              {text("payment_methods", "Moyens de paiement acceptés", { className: "sm:col-span-2" })}
              {text("late_penalty_text", "Pénalités de retard", { rows: 2, className: "sm:col-span-2" })}
              {text("recovery_fee_text", "Indemnité forfaitaire (clients professionnels)", { rows: 2, className: "sm:col-span-2" })}
              {text("early_payment_text", "Escompte", { className: "sm:col-span-2" })}
            </div>
          </Card>
          <Card title="Devis">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Durée de validité (jours)"><input inputMode="numeric" className="input" value={f.quote_validity_days} onChange={(e) => setF({ ...f, quote_validity_days: Number(e.target.value.replace(/\D/g, "")) || 30 })} /></Field>
              {text("quote_conditions", "Conditions par défaut", { rows: 4, className: "sm:col-span-2" })}
              {text("invoice_footer", "Pied de page des documents", { className: "sm:col-span-2" })}
            </div>
          </Card>
        </div>
      )}

      {tab === "tarifs" && <PricingSettings f={f} setF={setF} dirty={dirty} save={save} busy={busy} />}
      {tab === "mode" && <ModeSettings settings={settings!} onChanged={reload} />}
      {tab === "comptes" && <Accounts />}

      {saveBar}
    </>
  );
}

function PricingSettings({ f, setF, dirty, save, busy }: { f: CompanySettings; setF: (s: CompanySettings) => void; dirty: boolean; save: () => Promise<void>; busy: boolean }) {
  const { bands, reload } = useSettings();
  const [rows, setRows] = useState<(Omit<TravelBandRow, "max_km"> & { max_km: string; fee: string })[]>([]);
  const [addr, setAddr] = useState("");
  const [minimum, setMinimum] = useState(centsToInput(f.minimum_charge_cents));
  const { busy: savingBands, run } = useAction();
  useEffect(() => {
    setRows([...bands].sort((a, b) => (a.max_km ?? Infinity) - (b.max_km ?? Infinity)).map((b) => ({ ...b, max_km: b.max_km == null ? "" : String(b.max_km).replace(".", ","), fee: centsToInput(b.fee_cents) })));
  }, [bands]);

  async function saveBands() {
    await run(async () => {
      const parsed = rows.map((r) => ({ id: r.id, label: r.label, max_km: r.max_km.trim() === "" ? null : Number(r.max_km.replace(",", ".")), fee_cents: parseEuros(r.fee) }));
      if (parsed.filter((p) => p.max_km == null).length !== 1) throw new Error("Il faut exactement une tranche sans limite (dernière tranche).");
      if (parsed.some((p) => p.max_km != null && (!(p.max_km > 0) || Number.isNaN(p.max_km)))) throw new Error("Distances invalides.");
      if (new Set(parsed.map((p) => p.max_km)).size !== parsed.length) throw new Error("Deux tranches ont la même limite.");
      if (parsed.some((p) => p.fee_cents < 0)) throw new Error("Montants invalides.");
      const keep = parsed.map((p) => p.id).filter(Boolean);
      const removed = bands.filter((b) => !keep.includes(b.id));
      // supprimer d'abord l'ancienne tranche ouverte si elle change, pour respecter l'unicité
      for (const b of removed) await must(supabase.from("travel_bands").delete().eq("id", b.id));
      const open = parsed.find((p) => p.max_km == null)!;
      for (const p of parsed.filter((x) => x.max_km != null)) {
        if (p.id) await must(supabase.from("travel_bands").update({ max_km: p.max_km, fee_cents: p.fee_cents, label: p.label }).eq("id", p.id));
        else await must(supabase.from("travel_bands").insert({ max_km: p.max_km, fee_cents: p.fee_cents, label: p.label }));
      }
      if (open.id) await must(supabase.from("travel_bands").update({ max_km: null, fee_cents: open.fee_cents, label: open.label }).eq("id", open.id));
      else await must(supabase.from("travel_bands").insert({ max_km: null, fee_cents: open.fee_cents, label: open.label }));
    }, "Tranches enregistrées. Les documents déjà émis conservent leurs montants.");
    reload();
  }

  return (
    <div className="space-y-5">
      <Card title="Minimum de prestation">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Montant HT, hors déplacement" hint="S'applique au total des prestations d'une intervention.">
            <input inputMode="decimal" className="input" value={minimum} onChange={(e) => setMinimum(e.target.value)} onBlur={() => { try { setF({ ...f, minimum_charge_cents: Math.max(0, parseEuros(minimum)) }); } catch { /* ignore */ } }} />
          </Field>
        </div>
      </Card>

      <Card title="Point de départ">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Libellé"><input className="input" value={f.base_label} onChange={(e) => setF({ ...f, base_label: e.target.value })} /></Field>
          <Field label="Rechercher une adresse" hint={`Coordonnées actuelles : ${f.base_lat}, ${f.base_lng}`}>
            <AddressSearch value={addr} onChange={setAddr} onSelect={(r) => setF({ ...f, base_lat: Number(r.lat.toFixed(6)), base_lng: Number(r.lng.toFixed(6)) })} />
          </Field>
          <Field label="Seuil de validation manuelle (km)" hint="Au-delà, les demandes et devis sont signalés.">
            <input inputMode="decimal" className="input" value={f.manual_review_km} onChange={(e) => setF({ ...f, manual_review_km: Number(e.target.value.replace(",", ".")) || 0 })} />
          </Field>
          <Field label="Méthode de distance"><p className="py-2 text-sm">Vol d'oiseau (distance géographique)</p></Field>
        </div>
        <button className="btn-primary btn-sm mt-4" disabled={!dirty || busy} onClick={save}>Enregistrer minimum et point de départ</button>
      </Card>

      <Card title="Tranches de frais de déplacement" actions={<button className="btn-ghost btn-sm" onClick={() => setRows([...rows, { id: "", label: "", max_km: "", fee: "0,00", fee_cents: 0 }])}><Plus className="h-4 w-4" /> Tranche</button>}>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id || `new-${i}`} className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[1fr_8rem_8rem_auto]">
              <input className="input input-sm col-span-3 sm:col-span-1" placeholder="Libellé" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input className="input input-sm" placeholder="Jusqu'à (km) — vide = au-delà" aria-label="Distance maximale" value={r.max_km} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, max_km: e.target.value } : x)))} />
              <input className="input input-sm" placeholder="Frais HT" aria-label="Frais HT" value={r.fee} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, fee: e.target.value } : x)))} />
              <button className="btn-ghost btn-sm px-2" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">Bornes incluses (ex. 5 km = de 0 à 5 km inclus). La tranche sans limite s'applique au-delà de la plus grande borne.</p>
        <button className="btn-primary btn-sm mt-3" disabled={savingBands} onClick={saveBands}>Enregistrer les tranches</button>
        <Suspense fallback={null}>
          <div className="mt-5">
            <ZoneMap base={{ lat: f.base_lat, lng: f.base_lng, label: f.base_label }} bands={bands} className="h-72" />
          </div>
        </Suspense>
        <ul className="mt-3 text-sm">
          {bands.map((b) => <li key={b.id}>{b.label} : {formatEuros(b.fee_cents)} HT</li>)}
        </ul>
      </Card>
    </div>
  );
}

function ModeSettings({ settings, onChanged }: { settings: CompanySettings; onChanged: () => Promise<void> }) {
  const { data: missing, reload } = useAsync(async () => (await must(supabase.rpc("legal_readiness"))) as string[], [settings]);
  const confirm = useConfirm();
  const { busy, run } = useAction();
  const ready = missing && missing.length === 0;
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-3">
          <Badge tone={settings.mode === "exploitation" ? "ok" : "warn"}>{settings.mode === "exploitation" ? "Mode exploitation" : "Mode préparation"}</Badge>
          {settings.exploitation_since && <span className="text-sm text-ink-muted">depuis le {formatDateTime(settings.exploitation_since)}</span>}
        </div>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <h3 className="font-semibold">Préparation</h3>
            <p className="mt-1 text-ink-muted">Pour les exercices et simulations de l'accompagnement à la création. Les documents sont numérotés « SIM-… », filigranés et sans valeur commerciale.</p>
          </div>
          <div>
            <h3 className="font-semibold">Exploitation</h3>
            <p className="mt-1 text-ink-muted">Numérotation réelle, chronologique et sans trou. Nécessite des informations légales complètes et vérifiées. Retour en préparation impossible après la première facture réelle.</p>
          </div>
        </div>
      </Card>
      <Card title="Informations requises">
        {!missing ? <Loading /> : missing.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-900"><CheckCircle2 className="h-4 w-4" /> Toutes les informations obligatoires sont renseignées.</p>
        ) : (
          <ul className="space-y-1 text-sm">{missing.map((m) => <li key={m} className="flex items-center gap-2 text-red-900"><XCircle className="h-4 w-4" /> {m}</li>)}</ul>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {settings.mode === "preparation" ? (
            <button className="btn-primary" disabled={busy || !ready} onClick={async () => {
              const ok = await confirm({
                title: "Passer en mode exploitation ?",
                message: <div className="space-y-2"><p>Vérifiez que les informations légales sont exactes (SIREN, adresse, régime de TVA, IBAN). Elles figureront sur toutes les factures réelles.</p><p>Les simulations restent consultables mais ne sont jamais converties en factures réelles.</p></div>,
                confirmLabel: "Activer l'exploitation",
              });
              if (!ok) return;
              await run(() => must(supabase.rpc("set_operating_mode", { p_mode: "exploitation" })), "Mode exploitation activé");
              await onChanged();
              reload();
            }}><ShieldCheck className="h-4 w-4" /> Activer le mode exploitation</button>
          ) : (
            <button className="btn-ghost" disabled={busy} onClick={async () => {
              await run(() => must(supabase.rpc("set_operating_mode", { p_mode: "preparation" })), "Mode préparation rétabli");
              await onChanged();
            }}>Revenir au mode préparation</button>
          )}
        </div>
      </Card>
      <Card title="Facturation électronique">
        <p className="text-sm text-ink-muted">
          La réforme impose progressivement (réception dès septembre 2026, émission pour les TPE en septembre 2027) l'échange des factures B2B via une plateforme agréée, au format structuré (Factur-X, UBL ou CII). Les factures de ce logiciel conservent toutes les données nécessaires (SIREN client, adresse de livraison, catégorie d'opération, option TVA sur les débits) pour une transmission future ; un PDF seul ne suffit pas à satisfaire ces obligations.
        </p>
      </Card>
    </div>
  );
}

function Accounts() {
  const { session } = useAuth();
  const { data } = useAsync(async () => {
    const [profiles, allow] = await Promise.all([
      must(supabase.from("profiles").select("*").order("created_at")),
      must(supabase.from("admin_allowlist").select("*").order("created_at")),
    ]);
    return { profiles: profiles as { id: string; email: string; full_name: string; active: boolean; created_at: string }[], allow: allow as { email: string; full_name: string }[] };
  }, []);
  const [name, setName] = useState<string | null>(null);
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  const me = data.profiles.find((p) => p.id === session?.user.id);
  return (
    <div className="space-y-5">
      <Card title="Administrateurs">
        <ul className="divide-y divide-stone/20 text-sm">
          {data.profiles.map((p) => (
            <li key={p.id} className="flex justify-between py-2"><span><strong>{p.full_name || "—"}</strong> · {p.email}</span><Badge tone={p.active ? "ok" : "muted"}>{p.active ? "Actif" : "Inactif"}</Badge></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Les deux comptes ont les mêmes droits. L'ajout ou la désactivation d'un administrateur se fait dans Supabase (table admin_allowlist puis invitation Auth) — voir docs/DEPLOIEMENT.md.
          Adresses autorisées : {data.allow.map((a) => a.email).join(", ") || "aucune"}.
        </p>
      </Card>
      {me && (
        <Card title="Mon profil">
          <Field label="Nom affiché">
            <input className="input" value={name ?? me.full_name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className="btn-primary btn-sm mt-3" disabled={busy || name == null} onClick={() => run(() => must(supabase.from("profiles").update({ full_name: name }).eq("id", me.id)), "Profil mis à jour")}>Enregistrer</button>
        </Card>
      )}
    </div>
  );
}

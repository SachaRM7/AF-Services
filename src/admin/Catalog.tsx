import { useState } from "react";
import { AlertTriangle, Pencil, Plus } from "lucide-react";
import { must, supabase } from "../lib/supabase";
import { centsToInput, formatEuros, parseEuros } from "../lib/money";
import { UNIT_LABELS, type Unit } from "../lib/pricing";
import type { Service, ServiceCategory } from "../lib/types";
import { Badge, Card, Field, Modal, PageHeader, useAction } from "./ui";
import { useSettings } from "./settingsStore";

export default function Catalog() {
  const { categories, services, reload } = useSettings();
  const [edit, setEdit] = useState<Partial<Service> | null>(null);
  const [editCat, setEditCat] = useState<ServiceCategory | null>(null);
  const { run } = useAction();

  return (
    <>
      <PageHeader
        title="Prestations & tarifs"
        subtitle="Catalogue interne. Les tarifs ne sont jamais affichés sur le site public ; ils servent de base aux diagnostics et devis."
        actions={<button className="btn-primary btn-sm" onClick={() => setEdit({ unit: "heure", unit_price_cents: 3000, active: true, category_id: categories[0]?.id })}><Plus className="h-4 w-4" /> Prestation</button>}
      />
      <div className="space-y-5">
        {categories.map((c) => (
          <Card
            key={c.id}
            title={c.name}
            actions={<button className="btn-ghost btn-sm" onClick={() => setEditCat(c)}><Pencil className="h-3.5 w-3.5" /> Catégorie</button>}
          >
            <p className="mb-3 text-sm text-ink-muted">{c.summary} {!c.is_public && <Badge tone="muted">Non publiée</Badge>}</p>
            <ul className="divide-y divide-stone/20">
              {services.filter((s) => s.category_id === c.id).map((s) => (
                <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.name} {!s.active && <Badge tone="muted">Désactivée</Badge>} {s.requires_special_equipment && <Badge tone="warn"><AlertTriangle className="h-3 w-3" /> Matériel spécialisé</Badge>}</p>
                    {s.description && <p className="text-sm text-ink-muted">{s.description}</p>}
                    {s.constraints_text && <p className="text-xs text-amber-900">{s.constraints_text}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="whitespace-nowrap font-semibold">{formatEuros(s.unit_price_cents)} HT {UNIT_LABELS[s.unit].long}</span>
                    <button className="btn-ghost btn-sm" onClick={() => setEdit(s)} aria-label="Modifier"><Pencil className="h-4 w-4" /></button>
                    <button className="btn-ghost btn-sm" onClick={async () => { await run(() => must(supabase.from("services").update({ active: !s.active }).eq("id", s.id)), s.active ? "Prestation désactivée" : "Prestation réactivée"); reload(); }}>
                      {s.active ? "Désactiver" : "Réactiver"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <ServiceModal service={edit} categories={categories} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      <CategoryModal category={editCat} onClose={() => setEditCat(null)} onSaved={() => { setEditCat(null); reload(); }} />
    </>
  );
}

function ServiceModal({ service, categories, onClose, onSaved }: { service: Partial<Service> | null; categories: ServiceCategory[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Service>>({});
  const [price, setPrice] = useState("");
  const { busy, run } = useAction();
  const [last, setLast] = useState<Partial<Service> | null>(null);
  if (service !== last) {
    setLast(service);
    if (service) { setF(service); setPrice(centsToInput(service.unit_price_cents ?? 0)); }
  }
  async function save() {
    const ok = await run(async () => {
      const unit_price_cents = parseEuros(price);
      if (unit_price_cents < 0) throw new Error("Le tarif doit être positif.");
      const payload = { category_id: f.category_id, name: f.name, description: f.description ?? "", unit: f.unit, unit_price_cents, active: f.active ?? true, requires_special_equipment: f.requires_special_equipment ?? false, constraints_text: f.constraints_text ?? "" };
      if (f.id) await must(supabase.from("services").update(payload).eq("id", f.id));
      else await must(supabase.from("services").insert(payload));
      return true;
    }, "Prestation enregistrée");
    if (ok) onSaved();
  }
  return (
    <Modal open={!!service} onClose={onClose} title={f.id ? "Modifier la prestation" : "Nouvelle prestation"} footer={<><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy || !f.name || !f.category_id} onClick={save}>Enregistrer</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom" className="sm:col-span-2"><input className="input" value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Catégorie" className="sm:col-span-2">
          <select className="input" value={f.category_id ?? ""} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Description" className="sm:col-span-2"><textarea rows={2} className="input" value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Unité de facturation">
          <select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Unit })}>
            {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.long}</option>)}
          </select>
        </Field>
        <Field label="Tarif HT (€)"><input inputMode="decimal" className="input" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-ink" checked={f.active ?? true} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Disponible</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-ink" checked={f.requires_special_equipment ?? false} onChange={(e) => setF({ ...f, requires_special_equipment: e.target.checked })} /> Nécessite du matériel spécialisé</label>
        <Field label="Contraintes / conditions" className="sm:col-span-2" hint="Affichées comme avertissement lors des diagnostics."><textarea rows={2} className="input" value={f.constraints_text ?? ""} onChange={(e) => setF({ ...f, constraints_text: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function CategoryModal({ category, onClose, onSaved }: { category: ServiceCategory | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<ServiceCategory | null>(null);
  const { busy, run } = useAction();
  if (category && f?.id !== category.id) setF(category);
  if (!category && f) setF(null);
  return (
    <Modal open={!!category} onClose={onClose} title="Catégorie" footer={<><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => must(supabase.from("service_categories").update({ name: f!.name, summary: f!.summary, audience: f!.audience, form_kind: f!.form_kind, is_public: f!.is_public }).eq("id", f!.id)), "Catégorie enregistrée") !== undefined) onSaved(); }}>Enregistrer</button></>}>
      {f && (
        <div className="grid gap-4">
          <Field label="Nom"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Résumé"><textarea rows={2} className="input" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
          <Field label="Public">
            <select className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as ServiceCategory["audience"] })}>
              <option value="particuliers">Particuliers</option><option value="professionnels">Professionnels</option><option value="tous">Tous</option>
            </select>
          </Field>
          <Field label="Formulaire de diagnostic" hint="Détermine les champs spécifiques proposés lors de la visite.">
            <select className="input" value={f.form_kind} onChange={(e) => setF({ ...f, form_kind: e.target.value as ServiceCategory["form_kind"] })}>
              <option value="vitrerie">Vitrerie</option><option value="surfaces">Surfaces / locaux</option><option value="sanitaires">Sanitaires</option><option value="generique">Générique</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-ink" checked={f.is_public} onChange={(e) => setF({ ...f, is_public: e.target.checked })} /> Proposée dans le formulaire public</label>
        </div>
      )}
    </Modal>
  );
}

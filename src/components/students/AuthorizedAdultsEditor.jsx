'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

// RPW-r2 item 4: pick-up adults (« Sortie des jeunes » lists them), editable by every
// staff role that holds manage_authorized_adults; read-only otherwise.
export const ADULT_RELATIONS = ['Parent', 'Grand-parent', 'Chauffeur', 'Autre'];
const input = 'w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary';
const empty = { full_name: '', telephone: '', relation: 'Parent' };

export function adultErrorMessage(error) {
  const text = `${error?.message || ''} ${error?.details || ''}`;
  // A delete sets the dismissal history's adult to null, which that history refuses.
  if (/immutable/i.test(text)) return 'Cet adulte figure dans l’historique des sorties : modifiez sa fiche au lieu de la supprimer.';
  if (error?.code === '42501') return 'Action non autorisée pour votre rôle.';
  if (error?.code === '23514') return 'Vérifiez le nom, le téléphone et la relation.';
  return 'Enregistrement impossible. Réessayez.';
}

function AdultFields({ value, onChange, idPrefix }) {
  const set = (key, v) => onChange({ ...value, [key]: v });
  return <div className="grid gap-3 sm:grid-cols-3">
    <label className="block text-xs font-semibold text-muted-foreground" htmlFor={`${idPrefix}-name`}>Nom complet
      <input id={`${idPrefix}-name`} className={input} required maxLength={120} value={value.full_name} onChange={e => set('full_name', e.target.value)} /></label>
    <label className="block text-xs font-semibold text-muted-foreground" htmlFor={`${idPrefix}-phone`}>Téléphone
      <input id={`${idPrefix}-phone`} className={input} required maxLength={30} value={value.telephone} onChange={e => set('telephone', e.target.value)} /></label>
    <label className="block text-xs font-semibold text-muted-foreground" htmlFor={`${idPrefix}-relation`}>Relation
      <select id={`${idPrefix}-relation`} className={input} value={value.relation} onChange={e => set('relation', e.target.value)}>
        {ADULT_RELATIONS.map(r => <option key={r}>{r}</option>)}</select></label>
  </div>;
}

export default function AuthorizedAdultsEditor({ studentId, adults, canEdit, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const valid = v => v.full_name.trim().length >= 2 && v.telephone.trim().length > 0 && ADULT_RELATIONS.includes(v.relation);
  const clean = v => ({ full_name: v.full_name.trim(), telephone: v.telephone.trim(), relation: v.relation });

  const run = async (action, success) => {
    setSaving(true);
    const { error } = await action(getBrowserClient().from('authorized_adults'));
    setSaving(false);
    if (error) { toast.error(adultErrorMessage(error)); return false; }
    toast.success(success);
    onChanged?.();
    return true;
  };
  const add = async (event) => {
    event.preventDefault();
    if (!valid(draft)) { toast.error('Indiquez le nom, le téléphone et la relation.'); return; }
    if (await run(t => t.insert({ ...clean(draft), student_id: studentId }), 'Adulte ajouté')) { setDraft(empty); setAdding(false); }
  };
  const save = async (event) => {
    event.preventDefault();
    if (!valid(editing)) { toast.error('Indiquez le nom, le téléphone et la relation.'); return; }
    if (await run(t => t.update(clean(editing)).eq('id', editing.id).eq('student_id', studentId), 'Adulte mis à jour')) setEditing(null);
  };
  const remove = async (adult) => {
    if (!confirm(`Retirer ${adult.full_name} des adultes autorisés au retrait ?`)) return;
    await run(t => t.delete().eq('id', adult.id).eq('student_id', studentId), 'Adulte retiré');
  };

  return <div className="space-y-2">
    {adults.length === 0 && <p className="text-sm text-muted-foreground">Aucun adulte autorisé.</p>}
    {adults.map(a => editing?.id === a.id
      ? <form key={a.id} onSubmit={save} className="space-y-3 rounded-md border border-border p-3" aria-label={`Modifier ${a.full_name}`}>
          <AdultFields value={editing} onChange={setEditing} idPrefix={`adult-${a.id}`} />
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={saving}>Enregistrer</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button></div>
        </form>
      : <div key={a.id} data-adult-row className="flex items-center justify-between gap-3 p-3 bg-muted/40 rounded-md text-sm">
          <div>
            <p className="font-medium">{a.full_name}</p>
            <p className="text-xs text-muted-foreground">{a.relation} · {a.telephone}</p>
          </div>
          {canEdit && <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" aria-label={`Modifier ${a.full_name}`} onClick={() => setEditing({ id: a.id, full_name: a.full_name || '', telephone: a.telephone || '', relation: a.relation || 'Parent' })}><Pencil size={14} /></Button>
            <Button type="button" size="sm" variant="ghost" aria-label={`Retirer ${a.full_name}`} disabled={saving} onClick={() => remove(a)}><Trash2 size={14} /></Button>
          </div>}
        </div>)}
    {canEdit && (adding
      ? <form onSubmit={add} className="space-y-3 rounded-md border border-border p-3" aria-label="Nouvel adulte autorisé">
          <AdultFields value={draft} onChange={setDraft} idPrefix="adult-new" />
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={saving}>Ajouter</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(empty); }}>Annuler</Button></div>
        </form>
      : <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}><Plus size={14} />Ajouter un adulte</Button>)}
  </div>;
}

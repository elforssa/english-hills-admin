'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { crmRpc, useCrmRead, useCrmRefresh } from '@/lib/crm/queries';
import { actionErrorMessage, staffLabel } from '@/lib/crm/presentation.mjs';
import { DAYS, draftFrom, hoursDraftProblem, hoursPayload } from '@/lib/crm/centreHours.mjs';
import { useCrmCommand } from './useCrmCommand';

const control = 'min-h-9 rounded-md border border-border bg-white px-2 text-sm';

// « Horaires du centre » (director only, OD-3 = B): one set of hours for calls and
// the desk, the closed dates, and the default owner of new intake prospects (OD-6).
export default function CentreHoursCard() {
  const hours = useCrmRead('crm_get_centre_hours', {});
  const staff = useCrmRead('crm_list_staff', { p_limit: 50, p_offset: 0 });
  const command = useCrmCommand();
  const refresh = useCrmRefresh();
  const [draft, setDraft] = useState(null), [newDate, setNewDate] = useState('');
  const [owner, setOwner] = useState(''), [savingOwner, setSavingOwner] = useState(false), [ownerError, setOwnerError] = useState(null);
  const ownerLock = useRef(false);
  useEffect(() => { if (hours.data && !draft) { setDraft(draftFrom(hours.data)); setOwner(hours.data.default_owner_id || ''); } }, [hours.data, draft]);
  if (hours.isPending) return <p className="text-sm text-muted-foreground">Chargement des horaires…</p>;
  if (hours.isError || !draft) return <p role="alert" className="text-sm text-red-800">Horaires indisponibles. Rechargez la page.</p>;
  const problem = hoursDraftProblem(draft);
  const named = (staff.data?.rows || []).filter(person => person.name && person.name !== 'Équipe accueil');
  const edit = change => { command.clearError(); setDraft(current => change(structuredClone(current))); };
  async function publish() {
    const saved = await command.run('crm_create_followup_policy', () => {
      if (problem) throw new Error(problem);
      return hoursPayload(draft, hours.data);
    }, draft);
    if (saved) { toast.success(`Horaires publiés (version ${saved.version})`); setDraft(null); }
  }
  async function saveOwner() {
    if (ownerLock.current) return;
    ownerLock.current = true; setSavingOwner(true); setOwnerError(null);
    try {
      await crmRpc('crm_set_reception_default_owner', { p_owner: owner || null });
      await refresh();
      toast.success(owner ? 'Responsable par défaut enregistré' : 'Responsable par défaut retiré');
    } catch (err) { setOwnerError(err); } finally { ownerLock.current = false; setSavingOwner(false); }
  }
  return <div className="max-w-2xl space-y-6 rounded-xl border border-border bg-card p-6" data-testid="centre-hours-card">
    <div className="flex items-center gap-3"><Clock size={18} style={{ color: 'var(--brand)' }} /><h2 className="font-semibold">Horaires du centre</h2></div>
    <p className="text-sm text-muted-foreground">Mêmes horaires pour les appels et l’accueil · Heures de Casablanca · version {hours.data.version}. Les rendez-vous déjà pris hors des nouveaux horaires sont gardés, jamais déplacés.</p>
    <fieldset disabled={command.busy} className="space-y-3">
      {DAYS.map((day, index) => { const d = index + 1; return <div key={d} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2" data-testid={`hours-day-${d}`}>
        <span className="w-24 text-sm font-medium">{day}</span>
        {draft.week[d].length === 0 && <span className="text-sm text-slate-500">Fermé</span>}
        {draft.week[d].map((window, w) => <span key={w} className="flex items-center gap-1">
          <input aria-label={`${day} début ${w + 1}`} type="time" step="900" className={control} value={window.start} onChange={e => edit(x => { x.week[d][w].start = e.target.value; return x; })} />
          <span aria-hidden>–</span>
          <input aria-label={`${day} fin ${w + 1}`} type="time" step="900" className={control} value={window.end} onChange={e => edit(x => { x.week[d][w].end = e.target.value; return x; })} />
          <Button type="button" size="sm" variant="ghost" aria-label={`Retirer la plage ${w + 1} du ${day.toLowerCase()}`} onClick={() => edit(x => { x.week[d].splice(w, 1); return x; })}>Retirer</Button>
        </span>)}
        <Button type="button" size="sm" variant="outline" onClick={() => edit(x => { const last = x.week[d].at(-1); x.week[d].push(last ? { start: last.end, end: last.end } : { start: '09:00', end: '18:00' }); return x; })}>Ajouter une plage</Button>
      </div>; })}
      <div className="space-y-2"><p className="text-sm font-medium">Jours de fermeture</p>
        {draft.closed.length === 0 && <p className="text-sm text-slate-500">Aucun jour de fermeture.</p>}
        <ul className="flex flex-wrap gap-2">{draft.closed.map(date => <li key={date} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">{date}<Button type="button" size="sm" variant="ghost" aria-label={`Retirer le ${date}`} onClick={() => edit(x => { x.closed = x.closed.filter(c => c !== date); return x; })}>×</Button></li>)}</ul>
        <div className="flex flex-wrap items-center gap-2"><input aria-label="Jour de fermeture" type="date" className={control} value={newDate} onChange={e => setNewDate(e.target.value)} /><Button type="button" size="sm" variant="outline" disabled={!newDate} onClick={() => { edit(x => { x.closed = [...new Set([...x.closed, newDate])].sort(); return x; }); setNewDate(''); }}>Ajouter</Button></div>
      </div>
      {(problem || command.error) && <p role="alert" className="text-sm text-red-800">{command.error ? actionErrorMessage(command.error) : problem}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={!!problem || command.busy} onClick={publish}>{command.busy ? 'Publication…' : 'Publier ces horaires'}</Button><Button type="button" variant="ghost" disabled={command.busy} onClick={() => { command.clearError(); setDraft(draftFrom(hours.data)); }}>Annuler les modifications</Button></div>
    </fieldset>
    <div className="space-y-2 border-t pt-4"><p className="text-sm font-medium">Responsable par défaut des nouveaux prospects (Meta, site)</p>
      <p className="text-xs text-muted-foreground">Sans responsable, les nouveaux prospects arrivent « Non attribué ». Seuls les comptes de l’équipe avec un nom sont proposés.</p>
      <div className="flex flex-wrap items-center gap-2"><select aria-label="Responsable par défaut" className={control} disabled={savingOwner || staff.isPending} value={owner} onChange={e => { setOwnerError(null); setOwner(e.target.value); }}>
        <option value="">Aucun (non attribué)</option>
        {owner && !named.some(person => person.id === owner) && <option value={owner}>Responsable sélectionné</option>}
        {named.map(person => <option key={person.id} value={person.id}>{staffLabel(person)}</option>)}
      </select><Button type="button" variant="outline" disabled={savingOwner || owner === (hours.data.default_owner_id || '')} onClick={saveOwner}>{savingOwner ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
      {ownerError && <p role="alert" className="text-sm text-red-800">{actionErrorMessage(ownerError)}</p>}
    </div>
  </div>;
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { APPOINTMENT_OUTCOMES, actionErrorMessage } from '@/lib/crm/presentation.mjs';
import { CLOSE_REASON_LABELS, NOT_INTERESTED_WHY } from '@/lib/catalogue.mjs';
import { useCrmCommand } from './useCrmCommand';

// « Venu · pas intéressé » is « Pas intéressé » (§5.4): it asks why — the five reasons,
// or « Autre raison » (not_interested itself, with a précision). The server derives
// the status from the reason.
const VISIT_WHY = { ...Object.fromEntries(NOT_INTERESTED_WHY.map(code => [code, CLOSE_REASON_LABELS[code]])), not_interested: 'Autre raison' };
const control = 'operational-control font-normal';

// Four appointment outcomes (§4.9), on the drawer, the Tâches row and the calendar
// event. Enabled from the appointment's start (the server refuses earlier:
// crm_appointment.before_start). Two of them take a second step (§4.8, day script 6):
// « Venu · pas intéressé » closes the prospect, so it asks the reason; « Absent »
// shows the proposed reminder and saves on « Confirmer le rappel ».
export default function AppointmentOutcome({ leadId, version, action, compact = false }) {
  const command = useCrmCommand();
  const [pending, setPending] = useState(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  if (action?.task_type !== 'center_visit') return null;
  const enabled = !!action.outcome_enabled;
  async function record(code, extra = {}) {
    const saved = await command.run('crm_record_appointment_outcome', () => ({ lead_id: leadId, expected_version: version, action_id: action.id, outcome_code: code, ...extra }), [leadId, version, action.id, code, extra]);
    if (saved) {
      setPending(null);
      toast.success(code === 'came_not_interested' ? 'Rendez-vous noté · prospect clôturé' : 'Résultat du rendez-vous enregistré');
    }
  }
  function choose(code) {
    command.clearError();
    if (code === 'came_not_interested' || code === 'no_show') { setPending(code); setReason(''); setNote(''); }
    else record(code);
  }
  function closeLost(event) {
    event.preventDefault();
    record('came_not_interested', { next: { close: { reason, ...(note.trim() ? { note: note.trim() } : {}) } } });
  }
  return <div className="space-y-1" data-testid="appointment-outcome">
    {!compact && <p className="text-xs font-medium text-slate-600">Résultat du rendez-vous{!enabled && action.local_time ? ` · à partir de ${action.local_time.slice(0, 5)}` : ''}</p>}
    <div className="flex flex-wrap gap-1">{Object.entries(APPOINTMENT_OUTCOMES).map(([code, label]) => <Button key={code} type="button" size="sm" variant={pending === code ? 'default' : 'outline'} className="min-h-9" aria-pressed={pending === code} disabled={!enabled || command.busy} onClick={() => choose(code)}>{label}</Button>)}</div>
    {pending === 'no_show' && <div role="group" aria-label="Absent : rappel proposé" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm">
      <p>Rappel proposé : demain, à l’heure fixée par les horaires d’appel. Le test passe à « Absent ».</p>
      <div className="mt-2 flex flex-wrap gap-1"><Button type="button" size="sm" className="min-h-9" disabled={command.busy} onClick={() => record('no_show')}>Confirmer le rappel</Button><Button type="button" size="sm" variant="ghost" className="min-h-9" disabled={command.busy} onClick={() => setPending(null)}>Annuler</Button></div>
    </div>}
    {pending === 'came_not_interested' && <form noValidate onSubmit={closeLost} aria-label="Venu, pas intéressé : motif" className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm">
      <p>Le prospect sera clôturé comme perdu.</p>
      <label className="block text-xs font-medium">Motif<select aria-label="Motif" className={`${control} mt-1`} value={reason} onChange={e => { command.clearError(); setReason(e.target.value); }}><option value="">Choisir…</option>{Object.entries(VISIT_WHY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-xs font-medium">{reason === 'not_interested' ? 'Précisez le motif' : 'Précision (facultatif)'}<input aria-label={reason === 'not_interested' ? 'Précisez le motif' : 'Précision (facultatif)'} className={`${control} mt-1`} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="flex flex-wrap gap-1"><Button type="submit" size="sm" className="min-h-9" disabled={command.busy || !reason || (reason === 'not_interested' && !note.trim())}>Clôturer</Button><Button type="button" size="sm" variant="ghost" className="min-h-9" disabled={command.busy} onClick={() => setPending(null)}>Annuler</Button></div>
    </form>}
    {command.error && <p role="alert" className="text-xs text-red-800">{actionErrorMessage(command.error)}</p>}
  </div>;
}

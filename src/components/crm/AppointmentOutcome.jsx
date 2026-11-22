'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { APPOINTMENT_OUTCOMES, actionErrorMessage } from '@/lib/crm/presentation.mjs';
import { useCrmCommand } from './useCrmCommand';

// Four appointment outcomes (§4.9), on the drawer, the Tâches row and the calendar
// event. Enabled from the appointment's start (the server refuses earlier:
// crm_appointment.before_start). « Venu · pas intéressé » closes the prospect.
export default function AppointmentOutcome({ leadId, version, action, compact = false }) {
  const command = useCrmCommand();
  if (action?.task_type !== 'center_visit') return null;
  const enabled = !!action.outcome_enabled;
  async function record(code) {
    const saved = await command.run('crm_record_appointment_outcome', () => ({ lead_id: leadId, expected_version: version, action_id: action.id, outcome_code: code }), [leadId, version, action.id, code]);
    if (saved) toast.success(code === 'came_not_interested' ? 'Rendez-vous noté · prospect clôturé' : 'Résultat du rendez-vous enregistré');
  }
  return <div className="space-y-1" data-testid="appointment-outcome">
    {!compact && <p className="text-xs font-medium text-slate-600">Résultat du rendez-vous{!enabled && action.local_time ? ` · à partir de ${action.local_time.slice(0, 5)}` : ''}</p>}
    <div className="flex flex-wrap gap-1">{Object.entries(APPOINTMENT_OUTCOMES).map(([code, label]) => <Button key={code} type="button" size="sm" variant="outline" className="min-h-9" disabled={!enabled || command.busy} onClick={() => record(code)}>{label}</Button>)}</div>
    {command.error && <p role="alert" className="text-xs text-red-800">{actionErrorMessage(command.error)}</p>}
  </div>;
}

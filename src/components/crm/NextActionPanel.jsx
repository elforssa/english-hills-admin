'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { pluralFr } from '@/lib/ui/pluralFr.mjs';
import { CALL_RESULTS, SCHEDULE_KINDS, actionErrorMessage, attemptGapLabel } from '@/lib/crm/presentation.mjs';
import AppointmentOutcome from './AppointmentOutcome';
import { useCrmCommand } from './useCrmCommand';

// The drawer's one « Prochaine action » (§4.9): the action, its owner, « En retard »,
// one-tap call results, « Noter un échange » and « Changer », and the appointment
// outcomes. « Pas de réponse » saves on one tap (OD-20 = B): no undo, a mistake is
// corrected by a new exchange. The other results open « Noter un échange » with the
// result chosen.
export default function NextActionPanel({ lead, onExchange, onChange, onUnreachable }) {
  const action = lead.next_action;
  const check = useCrmRead('crm_check_action', { p_lead: lead.id });
  const gap = attemptGapLabel(check.data);
  const tap = useCrmCommand();
  async function noAnswer() {
    if (gap) { onExchange({ channel: 'phone', result: 'no_answer' }); return; }
    const saved = await tap.run('crm_log_exchange', () => ({ lead_id: lead.id, expected_version: lead.version, channel: 'phone', result: 'no_answer' }), [lead.id, action?.id, 'no_answer']);
    if (saved) toast.success('Pas de réponse enregistré');
  }
  return <section data-testid="next-action-panel" className="rounded-lg border bg-card p-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-blue-800">Prochaine action</p>
    <p className="mt-2 font-semibold" data-testid="next-action-label">{action?.label || 'Aucune prochaine action'}</p>
    <div className="mt-1 flex flex-wrap gap-2 text-xs">
      {action?.overdue && <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-800">En retard</span>}
      {action?.relance_due && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900">À relancer</span>}
      {SCHEDULE_KINDS[action?.schedule_kind] && <span className="font-medium text-blue-900">{SCHEDULE_KINDS[action.schedule_kind]}</span>}
    </div>
    {action && <p className="mt-1 text-xs text-muted-foreground">Responsable : {action.assigned_to ? action.assignee_display_label || 'Responsable indisponible' : 'Non attribué'}</p>}
    {action?.instructions && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{action.instructions}</p>}
    {lead.failed_attempts > 0 && <p className="mt-2 text-sm">{pluralFr(lead.failed_attempts, 'appel infructueux', 'appels infructueux')}{lead.failed_attempts < 5 ? ' sur 5' : ' · séquence automatique terminée'}</p>}
    {lead.post_test_result && <p className="mt-1 text-sm">Niveau recommandé : {lead.post_test_result.niveau_recommande}</p>}
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-slate-600">Appel{gap ? ` · ${gap}` : ''}</p>
      <div className="flex flex-wrap gap-1">{Object.entries(CALL_RESULTS).map(([key, label]) => <Button key={key} type="button" size="sm" variant={key === 'no_answer' ? 'default' : 'outline'} className="min-h-9" disabled={tap.busy}
        onClick={() => key === 'no_answer' ? noAnswer() : onExchange({ channel: 'phone', result: key })}>{key === 'no_answer' && tap.busy ? 'Enregistrement…' : label}</Button>)}</div>
      {tap.error && <p role="alert" className="text-xs text-red-800">{actionErrorMessage(tap.error)}</p>}
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-9" onClick={() => onExchange({})}>Noter un échange</Button><Button type="button" variant="outline" className="min-h-9" onClick={onChange}>Changer</Button>
      {lead.unreachable_eligible && <Button type="button" variant="ghost" className="min-h-9" onClick={onUnreachable}>Clôturer : injoignable</Button>}</div>
    {action?.task_type === 'center_visit' && <div className="mt-3 border-t pt-3"><AppointmentOutcome leadId={lead.id} version={lead.version} action={action} /></div>}
  </section>;
}

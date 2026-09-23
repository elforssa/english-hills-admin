'use client';

import { useRef, useState } from 'react';
import { Phone, MessageCircle, Plus, CalendarDays, MoreHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { ACTIVE, CALL_TASKS, EVENTS, TASKS, OUTCOMES, LOST, NOT_QUALIFIED, dateLabel, activityBody } from '@/lib/crm/presentation.mjs';
import { LifecycleBadge, Pager, ReadState } from './CrmShared';
import CrmActionDialog from './CrmActionDialog';
export default function LeadDetailSheet({
  leadId,
  onClose
}) {
  const moreRef = useRef(null);
  const [action, setAction] = useState(null),
    [historyOffset, setHistoryOffset] = useState(0),
    [formOffset, setFormOffset] = useState(0),
    [taskOffset, setTaskOffset] = useState(0),
    [formsOpen, setFormsOpen] = useState(false);
  const detail = useCrmRead('crm_get_workspace_detail', {
    p_lead: leadId
  });
  const history = useCrmRead('crm_get_history', {
    p_lead: leadId,
    p_limit: 20,
    p_offset: historyOffset
  });
  const forms = useCrmRead('crm_get_form_answers', {
    p_lead: leadId,
    p_limit: 5,
    p_offset: formOffset
  }, formsOpen);
  const tasks = useCrmRead('crm_list_open_tasks', {
    p_lead: leadId,
    p_limit: 10,
    p_offset: taskOffset
  });
  const lead = detail.data,
    active = ACTIVE.includes(lead?.status);
  const open = (name, task = null) => {
    setAction({
      name,
      task
    });
  };
  return <Sheet open onOpenChange={value => {
    if (!value) onClose();
  }}><SheetContent className="w-full overflow-y-auto px-5 sm:max-w-2xl sm:px-8"><SheetHeader className="pr-6 text-left"><SheetTitle>{lead?.contact_name || 'Prospect'}</SheetTitle><SheetDescription>Historique et prochaines étapes</SheetDescription></SheetHeader>
 <ReadState query={detail} empty="Ce prospect n’est plus disponible.">{lead && <div className="mt-5 space-y-5">
  <section><div className="flex flex-wrap items-center gap-3"><LifecycleBadge status={lead.status} /><span className="font-medium tabular-nums text-slate-800">{lead.phone || 'Téléphone à préciser'}</span></div>{lead.contact.email && <p className="mt-2 break-words text-sm text-slate-500">{lead.contact.email}</p>}<div className="mt-5 border-l-2 border-blue-200 pl-4"><p className="font-medium">{lead.learner_name || 'Apprenant à préciser'}{lead.learner_age != null ? ` · ${lead.learner_age} ans` : ''}</p><p className="mt-1 text-sm text-slate-500">{lead.program || 'Projet à préciser'}</p></div>{lead.source_label && <p className="mt-3 text-xs text-slate-400">Origine · {lead.source_label}</p>}{lead.closure_reason && <p className="mt-3 text-sm text-slate-600">{LOST[lead.closure_reason] || NOT_QUALIFIED[lead.closure_reason] || 'Clôturé'}{lead.closure_note ? ` · ${lead.closure_note}` : ''}</p>}</section>
  {active && <>
   <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-blue-800">Prochaine action</p><p className="mt-2 font-semibold">{lead.next_task ? TASKS[lead.next_task.task_type] || 'Action prévue' : lead.unreachable_eligible ? '5 appels infructueux effectués' : 'Choisir la prochaine étape'}</p>{lead.next_task && <p className="mt-1 text-sm text-slate-600">{dateLabel(lead.next_task.due_at)}</p>}<div className="mt-3 flex flex-wrap gap-2">{lead.next_task ? <><Button size="sm" onClick={() => open(CALL_TASKS.includes(lead.next_task.task_type) ? 'call' : 'complete', lead.next_task)}>{CALL_TASKS.includes(lead.next_task.task_type) ? 'Enregistrer un appel' : 'Marquer comme fait'}</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => open('reschedule', lead.next_task)}>Replanifier</Button><Button size="sm" variant="ghost" onClick={() => open('cancel', lead.next_task)}>Annuler l’action</Button></> : lead.unreachable_eligible ? <><Button onClick={() => open('schedule')}>Prévoir un autre appel</Button><Button variant="outline" className="min-h-11" onClick={() => open('unreachable')}>Clôturer : injoignable</Button></> : <Button size="sm" onClick={() => open('schedule')}>Planifier</Button>}</div></section>
   <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => open('call', lead.open_tasks?.find(t => CALL_TASKS.includes(t.task_type)))}><Phone size={15} className="mr-2" />Appel</Button><Button variant="outline" className="min-h-11" onClick={() => open('whatsapp')}><MessageCircle size={15} className="mr-2" />WhatsApp</Button><Button variant="outline" className="min-h-11" onClick={() => open('note')}><Plus size={15} className="mr-2" />Note</Button><Button variant="outline" className="min-h-11" onClick={() => open('schedule')}><CalendarDays size={15} className="mr-2" />Planifier</Button><DropdownMenu><DropdownMenuTrigger asChild><Button ref={moreRef} variant="outline" className="min-h-11"><MoreHorizontal size={17} className="mr-2" />Autres actions</Button></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={event => { if (action) event.preventDefault(); }}>{lead.status !== 'QUALIFIED' && <DropdownMenuItem onSelect={() => open('qualify')}>Qualifier / avancer</DropdownMenuItem>}<DropdownMenuItem onSelect={() => open('lost')}>Clôturer comme perdu</DropdownMenuItem><DropdownMenuItem onSelect={() => open('notQualified')}>Clôturer comme non qualifié</DropdownMenuItem><DropdownMenuItem onSelect={() => open('reassign')}>Attribuer un responsable</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
   {lead.failed_attempts > 0 && (lead.next_task || !lead.unreachable_eligible) && <div className="rounded-lg border p-4 text-sm"><p>{lead.failed_attempts} / 5 appels infructueux dans la séquence actuelle.</p>{lead.unreachable_eligible && <><p className="mt-1 text-slate-500">Poursuivre le suivi ou clôturer : à vous de décider.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="min-h-11" onClick={() => open('schedule')}>Prévoir un autre appel</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => open('unreachable')}>Clôturer : injoignable</Button></div></>}</div>}
   {(lead.open_task_count > 1 || taskOffset > 0) && <details><summary className="cursor-pointer text-sm font-medium">Toutes les prochaines actions ({lead.open_task_count})</summary><ReadState query={tasks}>{tasks.data?.map(task => <div key={task.id} className="mt-3 rounded-lg border p-3 text-sm"><p className="font-medium">{TASKS[task.task_type] || 'Action'}</p><p className="mt-1 text-slate-500">{dateLabel(task.due_at)}</p>{task.instructions && <p className="mt-2 whitespace-pre-wrap">{task.instructions}</p>}<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="min-h-11" onClick={() => open(CALL_TASKS.includes(task.task_type) ? 'call' : 'complete', task)}>{CALL_TASKS.includes(task.task_type) ? 'Résultat d’appel' : 'Fait'}</Button><Button size="sm" variant="ghost" onClick={() => open('reschedule', task)}>Replanifier</Button><Button size="sm" variant="ghost" onClick={() => open('cancel', task)}>Annuler</Button></div></div>)}</ReadState><Pager offset={taskOffset} total={lead.open_task_count} size={10} onChange={setTaskOffset} /></details>}
  </>}
  {['LOST', 'NOT_QUALIFIED'].includes(lead.status) && <Button onClick={() => open('reopen')}>Rouvrir le prospect</Button>}
  <section><h3 className="mb-4 font-semibold">Historique</h3><ReadState query={history} empty="Aucun échange enregistré.">{history.data?.rows?.length ? <ol className="space-y-4 border-l border-slate-200 pl-5">{history.data.rows.map(item => <li key={item.id}><p className="text-xs text-slate-400">{dateLabel(item.occurred_at)}{item.actor_name && <span className="ml-2" title={item.actor_name}>{/synthe|receptionist|director|admin|system|service_role/i.test(item.actor_name) ? 'Équipe' : item.actor_name}</span>}</p><p className="mt-1 text-sm font-medium">{EVENTS[item.event_type] || 'Activité'}{item.outcome && !item.event_type.startsWith('call_') ? ` · ${OUTCOMES[item.outcome] || LOST[item.outcome] || NOT_QUALIFIED[item.outcome] || 'Mise à jour'}` : ''}</p>{item.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{activityBody(item.body)}</p>}</li>)}</ol> : null}</ReadState><Pager offset={historyOffset} total={history.data?.total || 0} size={20} onChange={setHistoryOffset} /></section>
  <details onToggle={e => setFormsOpen(e.currentTarget.open)}><summary className="cursor-pointer border-t py-4 text-sm font-semibold">Réponses aux formulaires</summary>{formsOpen && <ReadState query={forms} empty="Aucune réponse enregistrée.">{forms.data?.rows?.length ? forms.data.rows.map(sub => <section key={sub.id} className="mb-4 rounded-lg bg-slate-50 p-4"><p className="text-sm font-medium">{sub.source_label || 'Demande'}</p><p className="mb-3 text-xs text-slate-400">{dateLabel(sub.occurred_at)}</p><dl className="space-y-3">{sub.answers.map((answer, i) => <div key={i}><dt className="text-xs text-slate-500">{answer.label || answer.key}</dt><dd className="mt-1 break-words text-sm">{Array.isArray(answer.value) ? answer.value.map(v => typeof v === 'boolean' ? v ? 'Oui' : 'Non' : String(v ?? '—')).join(' · ') : typeof answer.value === 'boolean' ? answer.value ? 'Oui' : 'Non' : String(answer.value ?? '—')}</dd></div>)}</dl>{!sub.answers.length && <p className="text-sm text-slate-500">Aucune réponse complémentaire.</p>}</section>) : null}</ReadState>}<Pager offset={formOffset} total={forms.data?.total || 0} size={5} onChange={setFormOffset} /></details>
 </div>}</ReadState>
 {action && lead && <CrmActionDialog key={`${action.name}:${action.task?.id || ''}`} action={action.name} lead={lead} task={lead.open_tasks?.find(t => t.id === action.task?.id) || action.task} onClose={() => setAction(null)} returnFocusRef={moreRef} />}
 </SheetContent></Sheet>;
}

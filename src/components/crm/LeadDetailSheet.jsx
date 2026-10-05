'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, Plus, CalendarDays, MoreHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { ACTIVE, CALL_TASKS, EVENTS, TASKS, OUTCOMES, LOST, NOT_QUALIFIED, dateLabel, scheduledLabel, activityBody, staffLabel, phoneLinks } from '@/lib/crm/presentation.mjs';
import { programmeLabel, CHANNEL_LABELS, answerValue, inquirySummary } from '@/lib/ui/presentation.mjs';
import { LifecycleBadge, Pager, ReadState } from './CrmShared';
import CrmActionDialog from './CrmActionDialog';
import LeadPlacementSection from './LeadPlacementSection';
import LeadEnrollmentSection from './LeadEnrollmentSection';
import CrmEnrollmentDialog from './CrmEnrollmentDialog';
import PlacementTestModal from '@/components/placement/PlacementTestModal';
export default function LeadDetailSheet({
  leadId,
  initialAction,
  initialTask,
  onClose,
  onRestoreFocus
}) {
  const moreRef = useRef(null);
  const [enrolling, setEnrolling] = useState(false);
  const [placement, setPlacement] = useState(undefined);
  const [action, setAction] = useState(initialAction && !['enrollment','unsupported'].includes(initialAction) ? {name:initialAction,task:initialTask || null} : null),
    [historyCursors, setHistoryCursors] = useState([null]),
    [formOffset, setFormOffset] = useState(0),
    [taskOffset, setTaskOffset] = useState(0),
    [formsOpen, setFormsOpen] = useState(false);
  const detail = useCrmRead('crm_get_workspace_detail', {
    p_lead: leadId
  });
  const acquisition = useCrmRead('crm_get_operational_acquisition_summary', {p_lead:leadId});
  const owners = useCrmRead('crm_list_staff', {p_limit:50,p_offset:0});
  const history = useCrmRead('crm_get_timeline', {
    p_lead: leadId,
    p_limit: 20,
    p_cursor: historyCursors.at(-1)
  });
  const forms = useCrmRead('crm_get_form_answers', {
    p_lead: leadId,
    p_limit: 5,
    p_offset: formOffset
  });
  const tasks = useCrmRead('crm_list_open_tasks', {
    p_lead: leadId,
    p_limit: 10,
    p_offset: taskOffset
  });
  const summaryForms = useCrmRead('crm_get_form_answers', { p_lead: leadId, p_limit: 5, p_offset: 0 });
  const lead = detail.data,
    active = ACTIVE.includes(lead?.status);
  const links = phoneLinks(lead?.contact);
  const leadStatus = lead?.status, enrollmentId = lead?.enrollment?.id;
  useEffect(() => {
    if (initialAction !== 'enrollment' || !leadStatus) return;
    if (enrollmentId) { const section = document.getElementById('crm-enrollment'); section?.focus(); section?.scrollIntoView({block:'nearest'}); }
    else if (leadStatus === 'QUALIFIED') setEnrolling(true);
  }, [initialAction, leadStatus, enrollmentId]);
  const open = (name, task = null) => {
    setAction({
      name,
      task
    });
  };
  return <Sheet open onOpenChange={value => {
    if (!value) onClose();
  }}><SheetContent onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus?.(); }} className="operational w-full max-w-full break-words overflow-y-auto p-4 sm:max-w-[620px] sm:rounded-l-overlay sm:p-6 motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none motion-reduce:transition-none"><SheetHeader className="pr-12 sm:pr-6 text-left"><SheetTitle>{lead?.contact_name || 'Prospect'}</SheetTitle><SheetDescription>{lead ? `${lead.learner_name || 'Apprenant à préciser'}${lead.learner_age != null ? ` · ${lead.learner_age} ans` : ''} · ${programmeLabel(lead.program)}` : 'Historique et prochaines étapes'}</SheetDescription></SheetHeader>
 <ReadState query={detail} empty="Ce prospect n’est plus disponible.">{lead && <div className="mt-5 space-y-6">
  {initialAction === 'unsupported' && <p role="status" className="rounded-lg border p-3 text-sm">Ce déplacement n’est pas pris en charge. Qualifiez le projet avant de commencer une inscription ; seules les actions enregistrées changent l’étape.</p>}
  <section aria-label="Coordonnées" className="space-y-1 text-sm"><p className="break-all"><span className="font-medium">Téléphone : </span>{lead.phone || 'Non précisé'}</p><p className="break-all"><span className="font-medium">WhatsApp : </span>{links.whatsapp ? `+${links.whatsapp.split('/').at(-1)}` : 'Indisponible'}</p>{lead.contact.email && <p className="break-all text-muted-foreground">{lead.contact.email}</p>}</section>
  {active && <>   <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-9" onClick={() => open('call', lead.open_tasks?.find(t => CALL_TASKS.includes(t.task_type)))}><Phone size={15} className="mr-2" />Appel</Button><Button variant="outline" className="min-h-9" onClick={() => open('whatsapp')}><MessageCircle size={15} className="mr-2" />WhatsApp</Button><Button variant="outline" className="min-h-9" onClick={() => open('note')}><Plus size={15} className="mr-2" />Note</Button><Button variant="outline" className="min-h-9" onClick={() => open('schedule')}><CalendarDays size={15} className="mr-2" />Planifier</Button><DropdownMenu><DropdownMenuTrigger asChild><Button ref={moreRef} variant="outline" className="min-h-9"><MoreHorizontal size={17} className="mr-2" />Autres actions</Button></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={event => { if (action) event.preventDefault(); }}>{lead.status !== 'QUALIFIED' && <DropdownMenuItem onSelect={() => open('qualify')}>Qualifier / avancer</DropdownMenuItem>}<DropdownMenuItem onSelect={() => open('conversation')}>Conversation au centre / autre canal</DropdownMenuItem><DropdownMenuItem onSelect={() => open('lost')}>Clôturer comme perdu</DropdownMenuItem><DropdownMenuItem onSelect={() => open('notQualified')}>Clôturer comme non qualifié</DropdownMenuItem><DropdownMenuItem onSelect={() => open('reassign')}>Attribuer un responsable</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></>}
  <section><div className="flex flex-wrap items-center gap-3"><LifecycleBadge status={lead.status} /><Button variant="ghost" className="min-h-9 text-xs" onClick={() => open('reassign')}>Responsable du prospect : {lead.owner_id ? staffLabel(owners.data?.rows.find(p => p.id === lead.owner_id)) : 'Non attribué'}</Button></div><div className="mt-5 border-l-2 border-blue-200 pl-4"><p className="font-medium">{lead.learner_name || 'Apprenant à préciser'}{lead.learner_age != null ? ` · ${lead.learner_age} ans` : ''}</p><p className="mt-1 text-sm text-slate-500">{programmeLabel(lead.program)}</p></div>{lead.source_label && <p className="mt-3 text-xs text-muted-foreground">Origine · {lead.source_label}</p>}{lead.closure_reason && <p className="mt-3 text-sm text-slate-600">{LOST[lead.closure_reason] || NOT_QUALIFIED[lead.closure_reason] || 'Clôturé'}{lead.closure_note ? ` · ${lead.closure_note}` : ''}</p>}</section>
  {active && <>
   <section className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-blue-800">Prochaine action</p><p className="mt-2 font-semibold">{lead.next_task ? TASKS[lead.next_task.task_type] || 'Action prévue' : lead.next_placement ? 'Test de niveau prévu' : lead.unreachable_eligible ? 'Séquence automatique d’appels terminée' : 'Choisir la prochaine étape'}</p>{(lead.next_task || lead.next_placement) && <p className="mt-1 text-sm text-slate-600">{scheduledLabel(lead.next_task || lead.next_placement)}</p>}{lead.next_task && <p className="mt-1 text-xs text-muted-foreground">Responsable de la tâche : {(lead.open_tasks?.find(t => t.id === lead.next_task.id)?.assigned_to || lead.next_task.assigned_to) ? staffLabel(owners.data?.rows.find(p => p.id === (lead.open_tasks?.find(t => t.id === lead.next_task.id)?.assigned_to || lead.next_task.assigned_to))) : 'Non attribué'}</p>}{lead.post_test_result && <p className="mt-1 text-sm">Niveau recommandé : {lead.post_test_result.niveau_recommande}</p>}<div className="mt-3 flex flex-wrap gap-2">{lead.status === 'QUALIFIED' && lead.next_task?.task_type === 'confirm_placement_test' && !lead.next_placement ? <Button onClick={() => setPlacement(null)}>Réserver un test</Button> : lead.next_task ? <><Button size="sm" onClick={() => open(CALL_TASKS.includes(lead.next_task.task_type) ? 'call' : 'complete', lead.next_task)}>{CALL_TASKS.includes(lead.next_task.task_type) ? 'Enregistrer un appel' : 'Marquer comme fait'}</Button><Button size="sm" variant="outline" className="min-h-9" onClick={() => open('reschedule', lead.next_task)}>Replanifier</Button><Button size="sm" variant="ghost" onClick={() => open('cancel', lead.next_task)}>Annuler l’action</Button><Button size="sm" variant="ghost" onClick={() => open('reassign', lead.open_tasks?.find(t => t.id === lead.next_task.id) || lead.next_task)}>Réattribuer l’action</Button></> : lead.next_placement ? <Button variant="outline" onClick={() => setPlacement(lead.next_placement)}>Voir le test</Button> : lead.unreachable_eligible ? <><Button onClick={() => open('schedule')}>Prévoir un autre appel</Button><Button variant="outline" className="min-h-9" onClick={() => open('unreachable')}>Clôturer : injoignable</Button></> : <Button size="sm" onClick={() => open('schedule')}>Planifier</Button>}</div></section>

   {lead.failed_attempts > 0 && (lead.next_task || !lead.unreachable_eligible) && <div className="rounded-lg border p-4 text-sm"><p>{lead.failed_attempts} appels infructueux enregistrés{lead.failed_attempts < 5 ? ' sur 5' : ' · Séquence automatique terminée'}.</p>{lead.unreachable_eligible && <><p className="mt-1 text-slate-500">Poursuivre le suivi ou clôturer : à vous de décider.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="min-h-9" onClick={() => open('schedule')}>Prévoir un autre appel</Button><Button size="sm" variant="outline" className="min-h-9" onClick={() => open('unreachable')}>Clôturer : injoignable</Button></div></>}</div>}
   {(lead.open_task_count > 1 || taskOffset > 0) && <details><summary className="cursor-pointer text-sm font-medium">Toutes les prochaines actions ({lead.open_task_count})</summary><ReadState query={tasks}>{tasks.data?.map(task => <div key={task.id} className="mt-3 rounded-lg border p-3 text-sm"><p className="font-medium">{TASKS[task.task_type] || 'Action'}</p><p className="mt-1 text-slate-500">{scheduledLabel(task)}</p>{task.instructions && <p className="mt-2 whitespace-pre-wrap">{task.instructions}</p>}<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="min-h-9" onClick={() => open(CALL_TASKS.includes(task.task_type) ? 'call' : 'complete', task)}>{CALL_TASKS.includes(task.task_type) ? 'Résultat d’appel' : 'Fait'}</Button><Button size="sm" variant="ghost" onClick={() => open('reschedule', task)}>Replanifier</Button><Button size="sm" variant="ghost" onClick={() => open('cancel', task)}>Annuler</Button><Button size="sm" variant="ghost" onClick={() => open('reassign', task)}>Réattribuer l’action</Button></div></div>)}</ReadState><Pager offset={taskOffset} total={lead.open_task_count} size={10} onChange={setTaskOffset} /></details>}
  </>}
  {['LOST', 'NOT_QUALIFIED'].includes(lead.status) && <Button onClick={() => open('reopen')}>Rouvrir le prospect</Button>}
  <section aria-label="Contexte de la demande"><h3 className="mb-2 text-base font-semibold">Contexte de la demande</h3><ReadState query={summaryForms} empty="Aucune réponse complémentaire enregistrée.">{summaryForms.data?.rows?.length ? <div className="space-y-3">{summaryForms.data.rows.slice(0,1).map(sub => <div key={sub.id}><p className="text-xs text-muted-foreground">{sub.source_label || 'Demande'} · {dateLabel(sub.occurred_at)}</p><dl className="mt-2 space-y-2">{inquirySummary(sub).map((answer,i)=><div key={i}><dt className="text-xs text-muted-foreground">{answer.label || answer.key}</dt><dd className="break-words text-sm">{answerValue(answer)}</dd></div>)}</dl><p className="mt-2 text-xs text-muted-foreground">Résumé de cette demande · les autres réponses et demandes restent accessibles ci-dessous.</p></div>)}</div> : null}</ReadState></section>
  <LeadEnrollmentSection lead={lead} onStart={() => setEnrolling(true)} />
  <LeadPlacementSection lead={lead} onOpen={setPlacement} />
  <section className="border-t pt-4"><h3 className="mb-3 text-base leading-6 font-semibold">Acquisition</h3><ReadState query={acquisition}>{acquisition.data && <dl className="space-y-3 text-sm">{[['first_inquiry','Première demande'],['latest_inquiry','Dernière demande']].map(([key,label]) => <div key={key}><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words">{acquisition.data[key]?.source_label || CHANNEL_LABELS[acquisition.data[key]?.channel] || 'Origine non précisée'} · {dateLabel(acquisition.data[key]?.occurred_at)}</dd></div>)}</dl>}</ReadState></section>
  <details onToggle={e => setFormsOpen(e.currentTarget.open)}><summary className="cursor-pointer border-t py-4 text-sm font-semibold">Réponses aux formulaires</summary>{formsOpen && <ReadState query={forms} empty="Aucune réponse enregistrée.">{forms.data?.rows?.length ? forms.data.rows.map(sub => <section key={sub.id} className="mb-4 rounded-lg bg-slate-50 p-4"><p className="text-sm font-medium">{sub.source_label || 'Demande'}</p><p className="mb-3 text-xs text-muted-foreground">{dateLabel(sub.occurred_at)}</p><dl className="space-y-3">{sub.answers.map((answer, i) => <div key={i}><dt className="text-xs text-slate-500">{answer.label || answer.key}</dt><dd className="mt-1 break-words text-sm">{answerValue(answer)}</dd></div>)}</dl>{!sub.answers.length && <p className="text-sm text-slate-500">Aucune réponse complémentaire.</p>}</section>) : null}</ReadState>}<Pager offset={formOffset} total={forms.data?.total || 0} size={5} onChange={setFormOffset} /></details>  <section><h3 className="mb-4 text-base leading-6 font-semibold">Historique</h3><ReadState query={history} empty="Aucun échange enregistré.">{history.data?.rows?.length ? <ol className="space-y-4 border-l border-slate-200 pl-5">{history.data.rows.map(item => <li key={item.id}><p className="text-xs text-muted-foreground">{dateLabel(item.occurred_at)}{item.actor_name && <span className="ml-2" title={item.actor_name}>{/synthe|receptionist|director|admin|system|service_role/i.test(item.actor_name) ? 'Équipe' : item.actor_name}</span>}</p><p className="mt-1 text-sm font-medium">{EVENTS[item.event_type] || 'Activité enregistrée'}{item.outcome && !item.event_type.startsWith('call_') ? ` · ${OUTCOMES[item.outcome] || LOST[item.outcome] || NOT_QUALIFIED[item.outcome] || 'Mise à jour'}` : ''}</p>{item.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{activityBody(item.body)}</p>}</li>)}</ol> : null}</ReadState><div className="mt-4 flex gap-2"><Button variant="outline" disabled={historyCursors.length === 1} onClick={() => setHistoryCursors(x => x.slice(0,-1))}>Plus récents</Button><Button variant="outline" disabled={!history.data?.has_more} onClick={() => setHistoryCursors(x => [...x,history.data.next_cursor])}>Charger les plus anciens</Button></div></section>

 </div>}</ReadState>
 {action && lead && <CrmActionDialog key={`${action.name}:${action.task?.id || ''}`} action={action.name} lead={lead} task={action.task} onClose={() => setAction(null)} returnFocusRef={moreRef} />}
 {placement !== undefined && lead && <PlacementTestModal key={placement?.id || 'booking'} test={placement} crmLead={lead} onSave={() => setPlacement(undefined)} onClose={() => setPlacement(undefined)} />}
 {enrolling && lead && <CrmEnrollmentDialog lead={lead} onClose={() => setEnrolling(false)} />}
 </SheetContent></Sheet>;
}

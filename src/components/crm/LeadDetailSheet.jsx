'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Phone, MessageCircle, Plus, CalendarDays, MoreHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { ACTIVE, CALL_TASKS, EVENTS, OUTCOMES, LOST, NOT_QUALIFIED, SCHEDULE_KINDS, dateLabel, scheduledLabel, activityBody, historySummary, phoneLinks, taskTitle } from '@/lib/crm/presentation.mjs';
import { programmeLabel, CHANNEL_LABELS, answerValue, inquirySummary } from '@/lib/ui/presentation.mjs';
import { LifecycleBadge, Pager, ReadState } from './CrmShared';
import CrmActionDialog from './CrmActionDialog';
import LeadPlacementSection from './LeadPlacementSection';
import LeadEnrollmentSection from './LeadEnrollmentSection';
import CrmEnrollmentDialog from './CrmEnrollmentDialog';
import PlacementTestModal from '@/components/placement/PlacementTestModal';
import { useGuardedLayer, useNestedLayerEscapeGuard } from './useNestedLayerEscapeGuard';
const inquiryLabel = inquiry => `${inquiry?.source_label || CHANNEL_LABELS[inquiry?.channel] || 'Origine non précisée'} · ${dateLabel(inquiry?.occurred_at)}`;
const sameInquiry = (a, b) => JSON.stringify([a?.source_label, a?.channel, a?.occurred_at]) === JSON.stringify([b?.source_label, b?.channel, b?.occurred_at]);
function HistoryItem({ item }) {
  return <li><p className="text-xs text-muted-foreground">{dateLabel(item.occurred_at)}{item.actor_name && <span className="ml-2" title={item.actor_name}>{/synthe|receptionist|director|admin|system|service_role/i.test(item.actor_name) ? 'Équipe' : item.actor_name}</span>}</p><p className="mt-1 text-sm font-medium">{EVENTS[item.event_type] || 'Activité enregistrée'}{item.outcome && !item.event_type.startsWith('call_') ? ` · ${OUTCOMES[item.outcome] || LOST[item.outcome] || NOT_QUALIFIED[item.outcome] || 'Mise à jour'}` : ''}</p>{item.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{activityBody(item.body)}</p>}</li>;
}
// Each open-task menu is a controlled popup registered with the drawer's Escape guard.
function TaskOptions({ task, layers, onReassign }) {
  const menu = useGuardedLayer(layers);
  return <DropdownMenu open={menu.open} onOpenChange={menu.onOpenChange}><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="min-h-9 px-2" aria-label={`Plus d’options · ${taskTitle(task)}`}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={onReassign}>Réattribuer l’action</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
export default function LeadDetailSheet({
  leadId,
  initialAction,
  initialTask,
  onClose,
  onRestoreFocus
}) {
  const moreRef = useRef(null), menuAction = useRef(null);
  const [enrolling, setEnrolling] = useState(false);
  const [placement, setPlacement] = useState(undefined);
  const [action, setAction] = useState(initialAction && !['enrollment','unsupported'].includes(initialAction) ? {name:initialAction,task:initialTask || null} : null),
    [historyCursors, setHistoryCursors] = useState([null]),
    [historyOpen, setHistoryOpen] = useState(false),
    [formOffset, setFormOffset] = useState(0),
    [taskOffset, setTaskOffset] = useState(0),
    [formsOpen, setFormsOpen] = useState(false);
  const guard = useNestedLayerEscapeGuard();
  const more = useGuardedLayer(guard.layers);
  const historyId = useId();
  const detail = useCrmRead('crm_get_workspace_detail', {
    p_lead: leadId
  });
  const acquisition = useCrmRead('crm_get_operational_acquisition_summary', {p_lead:leadId});
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
  // An Autres actions item opens its dialog once the menu has returned focus to its
  // trigger, so closing the dialog returns there too (E2).
  const openFromMenu = (name, task = null) => { menuAction.current = { name, task }; };
  const latest = acquisition.data?.latest_inquiry, first = acquisition.data?.first_inquiry;
  const historyRows = history.data?.rows || [];
  // One Sheet → SheetContent tree for every band: only classes differ. SheetContent does
  // not scroll, so the primitive's single "Fermer" stays pinned above the scrolling body.
  return <Sheet open onOpenChange={value => {
    if (!value) onClose();
  }}><SheetContent onEscapeKeyDown={guard.onEscapeKeyDown} onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus?.(); }} className="operational flex w-full max-w-full flex-col gap-0 overflow-hidden break-words p-0 sm:max-w-[620px] sm:rounded-l-overlay motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none motion-reduce:transition-none">
 <div data-drawer-header className="shrink-0 border-b px-4 pb-3 pr-14 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pr-14 sm:pt-5"><SheetHeader className="space-y-1 text-left"><SheetTitle>{lead?.contact_name || 'Prospect'}</SheetTitle><SheetDescription>{lead ? `${lead.learner_name || 'Apprenant à préciser'}${lead.learner_age != null ? ` · ${lead.learner_age} ans` : ''} · ${programmeLabel(lead.program)}` : 'Historique et prochaines étapes'}</SheetDescription></SheetHeader>
  {lead && <><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><LifecycleBadge status={lead.status} /><span className="text-xs text-muted-foreground">Responsable : {lead.owner_id ? lead.owner_display_label || 'Responsable indisponible' : 'Non attribué'}</span></div>
  <p className="mt-1 break-words text-xs text-muted-foreground"><span className="break-all">Tél. {lead.phone || 'Non précisé'}</span> · <span className="break-all">WhatsApp {links.whatsapp ? `+${links.whatsapp.split('/').at(-1)}` : 'Indisponible'}</span>{lead.contact.email && <> · <span className="break-all">{lead.contact.email}</span></>}</p></>}
 </div>
 <div data-drawer-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
 <ReadState query={detail} empty="Ce prospect n’est plus disponible.">{lead && <div className="space-y-6">
  {initialAction === 'unsupported' && <p role="status" className="rounded-lg border p-3 text-sm">Ce déplacement n’est pas pris en charge. Qualifiez le projet avant de commencer une inscription ; seules les actions enregistrées changent l’étape.</p>}
  {active && <>
   <section className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-blue-800">Prochaine action</p><p className="mt-2 font-semibold">{lead.next_task ? taskTitle(lead.next_task) : lead.next_placement ? 'Test de niveau prévu' : lead.unreachable_eligible ? 'Séquence automatique d’appels terminée' : 'Choisir la prochaine étape'}</p>{SCHEDULE_KINDS[lead.next_task?.schedule_kind] && <p className="mt-1 text-xs font-medium text-blue-900">{SCHEDULE_KINDS[lead.next_task.schedule_kind]}</p>}{(lead.next_task || lead.next_placement) && <p className="mt-1 text-sm text-slate-600">{scheduledLabel(lead.next_task || lead.next_placement)}</p>}{lead.next_task && <p className="mt-1 text-xs text-muted-foreground">Responsable de la tâche : {(lead.open_tasks?.find(t => t.id === lead.next_task.id)?.assigned_to || lead.next_task.assigned_to) ? lead.open_tasks?.find(t => t.id === lead.next_task.id)?.assignee_display_label || lead.next_task.assignee_display_label || 'Responsable indisponible' : 'Non attribué'}</p>}{lead.post_test_result && <p className="mt-1 text-sm">Niveau recommandé : {lead.post_test_result.niveau_recommande}</p>}<div className="mt-3 flex flex-wrap gap-2">{lead.status === 'QUALIFIED' && lead.next_task?.task_type === 'confirm_placement_test' && !lead.next_placement ? <Button onClick={() => setPlacement(null)}>Réserver un test</Button> : lead.next_task ? <><Button size="sm" onClick={() => open(CALL_TASKS.includes(lead.next_task.task_type) ? 'call' : 'complete', lead.next_task)}>{CALL_TASKS.includes(lead.next_task.task_type) ? 'Enregistrer un appel' : 'Marquer comme fait'}</Button><Button size="sm" variant="outline" className="min-h-9" onClick={() => open('reschedule', lead.next_task)}>Replanifier</Button><Button size="sm" variant="ghost" onClick={() => open('cancel', lead.next_task)}>Annuler l’action</Button></> : lead.next_placement ? <Button variant="outline" onClick={() => setPlacement(lead.next_placement)}>Voir le test</Button> : lead.unreachable_eligible ? <><Button onClick={() => open('schedule')}>Prévoir un autre appel</Button><Button variant="outline" className="min-h-9" onClick={() => open('unreachable')}>Clôturer : injoignable</Button></> : <Button size="sm" onClick={() => open('schedule')}>Planifier</Button>}</div></section>
   <section aria-label="Actions rapides" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><Button variant="outline" className="min-h-9" onClick={() => open('call', lead.open_tasks?.find(t => CALL_TASKS.includes(t.task_type)))}><Phone size={15} className="mr-2" />Appel</Button><Button variant="outline" className="min-h-9" onClick={() => open('whatsapp')}><MessageCircle size={15} className="mr-2" />WhatsApp</Button><Button variant="outline" className="min-h-9" onClick={() => open('note')}><Plus size={15} className="mr-2" />Note</Button><Button variant="outline" className="min-h-9" onClick={() => open('schedule')}><CalendarDays size={15} className="mr-2" />Planifier</Button><DropdownMenu open={more.open} onOpenChange={more.onOpenChange}><DropdownMenuTrigger asChild><Button ref={moreRef} variant="outline" className="col-span-2 min-h-9"><MoreHorizontal size={17} className="mr-2" />Autres actions</Button></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={() => { const next = menuAction.current; menuAction.current = null; if (next) setAction(next); }}>{lead.status !== 'QUALIFIED' && <DropdownMenuItem onSelect={() => openFromMenu('qualify')}>Qualifier / avancer</DropdownMenuItem>}<DropdownMenuItem onSelect={() => openFromMenu('conversation')}>Conversation au centre / autre canal</DropdownMenuItem><DropdownMenuItem onSelect={() => openFromMenu('lost')}>Clôturer comme perdu</DropdownMenuItem><DropdownMenuItem onSelect={() => openFromMenu('notQualified')}>Clôturer comme non qualifié</DropdownMenuItem><DropdownMenuItem onSelect={() => openFromMenu('reassign')}>Attribuer un responsable</DropdownMenuItem>{lead.next_task && <DropdownMenuItem onSelect={() => openFromMenu('reassign', lead.open_tasks?.find(t => t.id === lead.next_task.id) || lead.next_task)}>Réattribuer la prochaine action</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></section>
   {lead.failed_attempts > 0 && (lead.next_task || !lead.unreachable_eligible) && <div className="rounded-lg border p-4 text-sm"><p>{lead.failed_attempts} appels infructueux enregistrés{lead.failed_attempts < 5 ? ' sur 5' : ' · Séquence automatique terminée'}.</p>{lead.unreachable_eligible && <><p className="mt-1 text-slate-500">Poursuivre le suivi ou clôturer : à vous de décider.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="min-h-9" onClick={() => open('schedule')}>Prévoir un autre appel</Button><Button size="sm" variant="outline" className="min-h-9" onClick={() => open('unreachable')}>Clôturer : injoignable</Button></div></>}</div>}
   {(lead.open_task_count > 1 || taskOffset > 0) && <details><summary className="cursor-pointer text-sm font-medium">Toutes les prochaines actions ({lead.open_task_count})</summary><ReadState query={tasks}>{tasks.data?.map(task => <div key={task.id} className="mt-3 rounded-lg border p-3 text-sm"><p className="font-medium">{taskTitle(task)}</p>{SCHEDULE_KINDS[task.schedule_kind] && <p className="mt-1 text-xs text-blue-900">{SCHEDULE_KINDS[task.schedule_kind]}</p>}<p className="mt-1 text-slate-500">{scheduledLabel(task)}</p>{task.instructions && <p className="mt-2 whitespace-pre-wrap">{task.instructions}</p>}<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="min-h-9" onClick={() => open(CALL_TASKS.includes(task.task_type) ? 'call' : 'complete', task)}>{CALL_TASKS.includes(task.task_type) ? 'Résultat d’appel' : 'Fait'}</Button><Button size="sm" variant="ghost" onClick={() => open('reschedule', task)}>Replanifier</Button><Button size="sm" variant="ghost" onClick={() => open('cancel', task)}>Annuler</Button><TaskOptions task={task} layers={guard.layers} onReassign={() => open('reassign', task)} /></div></div>)}</ReadState><Pager offset={taskOffset} total={lead.open_task_count} size={10} onChange={setTaskOffset} /></details>}
  </>}
  {(lead.closure_reason || ['LOST', 'NOT_QUALIFIED'].includes(lead.status)) && <section className="space-y-3">{lead.closure_reason && <p className="text-sm text-slate-600">{LOST[lead.closure_reason] || NOT_QUALIFIED[lead.closure_reason] || 'Clôturé'}{lead.closure_note ? ` · ${lead.closure_note}` : ''}</p>}{['LOST', 'NOT_QUALIFIED'].includes(lead.status) && <Button onClick={() => open('reopen')}>Rouvrir le prospect</Button>}</section>}
  <section aria-labelledby={`${historyId}-demande`} className="space-y-3 border-t pt-4"><h3 id={`${historyId}-demande`} className="text-base leading-6 font-semibold">Demande</h3>
   <dl className="text-sm"><div><dt className="inline text-muted-foreground">Origine du prospect · </dt><dd className="inline break-words">{lead.source_label || 'Origine à préciser'}</dd></div></dl>
   <ReadState query={acquisition}>{acquisition.data && <dl className="space-y-1 text-sm"><div><dt className="inline text-muted-foreground">Dernière demande · </dt><dd className="inline break-words">{inquiryLabel(latest)}</dd></div>{first && !sameInquiry(first, latest) && <div><dt className="inline text-muted-foreground">Première demande · </dt><dd className="inline break-words">{inquiryLabel(first)}</dd></div>}</dl>}</ReadState>
   <dl className="text-sm"><div><dt className="inline text-muted-foreground">Intérêt déclaré · </dt><dd className="inline break-words">{programmeLabel(lead.program)}</dd></div></dl>
   <div><h4 className="mb-1 text-sm font-medium">Résumé de la dernière demande</h4><ReadState query={summaryForms} empty="Aucune réponse complémentaire enregistrée.">{summaryForms.data?.rows?.length ? <div className="space-y-3">{summaryForms.data.rows.slice(0,1).map(sub => <div key={sub.id}><p className="text-xs text-muted-foreground">{sub.source_label || 'Demande'} · {dateLabel(sub.occurred_at)}</p><dl className="mt-2 space-y-2">{inquirySummary(sub).map((answer,i)=><div key={i}><dt className="text-xs text-muted-foreground">{answer.label || answer.key}</dt><dd className="break-words text-sm">{answerValue(answer)}</dd></div>)}</dl></div>)}</div> : null}</ReadState></div>
   <details onToggle={e => setFormsOpen(e.currentTarget.open)}><summary className="cursor-pointer py-2 text-sm font-semibold">Toutes les réponses aux formulaires</summary>{formsOpen && <ReadState query={forms} empty="Aucune réponse enregistrée.">{forms.data?.rows?.length ? forms.data.rows.map(sub => <section key={sub.id} className="mb-4 rounded-lg bg-slate-50 p-4"><p className="text-sm font-medium">{sub.source_label || 'Demande'}</p><p className="mb-3 text-xs text-muted-foreground">{dateLabel(sub.occurred_at)}</p><dl className="space-y-3">{sub.answers.map((answer, i) => <div key={i}><dt className="text-xs text-slate-500">{answer.label || answer.key}</dt><dd className="mt-1 break-words text-sm">{answerValue(answer)}</dd></div>)}</dl>{!sub.answers.length && <p className="text-sm text-slate-500">Aucune réponse complémentaire.</p>}</section>) : null}</ReadState>}<Pager offset={formOffset} total={forms.data?.total || 0} size={5} onChange={setFormOffset} /></details>
  </section>
  <LeadPlacementSection lead={lead} onOpen={setPlacement} />
  <LeadEnrollmentSection lead={lead} onStart={() => setEnrolling(true)} />
  <section className="border-t pt-4"><h3 className="mb-3 text-base leading-6 font-semibold">Historique</h3><div id={historyId}><ReadState query={history} empty="Aucun échange enregistré.">{historyRows.length ? historyOpen ? <ol className="space-y-4 border-l border-slate-200 pl-5">{historyRows.map(item => <HistoryItem key={item.id} item={item} />)}</ol> : <><p className="mb-3 text-xs font-medium text-muted-foreground">Derniers échanges</p><ol className="space-y-4 border-l border-slate-200 pl-5">{historySummary(historyRows).map(item => <HistoryItem key={item.id} item={item} />)}</ol></> : null}</ReadState></div>
   {(historyRows.length > 0 || historyOpen) && <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" aria-expanded={historyOpen} aria-controls={historyId} onClick={() => { setHistoryCursors([null]); setHistoryOpen(x => !x); }}>{historyOpen ? 'Afficher les derniers échanges' : 'Afficher tout l’historique'}</Button>{historyOpen && <><Button variant="outline" disabled={historyCursors.length === 1} onClick={() => setHistoryCursors(x => x.slice(0,-1))}>Plus récents</Button><Button variant="outline" disabled={!history.data?.has_more} onClick={() => setHistoryCursors(x => [...x,history.data.next_cursor])}>Charger les plus anciens</Button></>}</div>}</section>
 </div>}</ReadState>
 </div>
 {action && lead && <CrmActionDialog key={`${action.name}:${action.task?.id || ''}`} action={action.name} lead={lead} task={action.task} onClose={() => setAction(null)} returnFocusRef={moreRef} />}
 {placement !== undefined && lead && <PlacementTestModal key={placement?.id || 'booking'} test={placement} crmLead={lead} onSave={() => setPlacement(undefined)} onClose={() => setPlacement(undefined)} />}
 {enrolling && lead && <CrmEnrollmentDialog lead={lead} onClose={() => setEnrolling(false)} />}
 </SheetContent></Sheet>;
}

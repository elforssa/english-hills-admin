'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { ACTIVE, COMMAND_LABELS, EVENTS, OUTCOMES, closeReasonLabel, adSourceLabel, collapseArrival, dateLabel, activityBody, historySummary, phoneLinks } from '@/lib/crm/presentation.mjs';
import { programmeLabel, CHANNEL_LABELS, answerLabel, answerProgramme, answerValue, inquirySummary, isProgrammeAnswer, sameText, sourceWithoutProgramme } from '@/lib/ui/presentation.mjs';
import { LifecycleBadge, Pager, ReadState } from './CrmShared';
import CrmActionDialog from './CrmActionDialog';
import NextActionPanel from './NextActionPanel';
import TakeProspectButton from './TakeProspectButton';
import ExchangeDialog from './ExchangeDialog';
import NextActionDialog from './NextActionDialog';
import LeadPlacementSection from './LeadPlacementSection';
import LeadEnrollmentSection from './LeadEnrollmentSection';
import CrmEnrollmentDialog from './CrmEnrollmentDialog';
import PlacementTestModal from '@/components/placement/PlacementTestModal';
import ProspectEditDialog from './ProspectEditDialog';
import LeadPeopleSection from './LeadPeopleSection';
import { formatPhoneFr, maskPhone } from '@/lib/phone.mjs';
import { CLOSE_REASON_LABELS, originLabel } from '@/lib/catalogue.mjs';
import { useGuardedLayer, useNestedLayerEscapeGuard } from './useNestedLayerEscapeGuard';
const inquiryLabel = (inquiry, programmes = []) => `${sourceWithoutProgramme(inquiry?.source_label, ...programmes) || CHANNEL_LABELS[inquiry?.channel] || 'Origine non précisée'} · ${dateLabel(inquiry?.occurred_at)}`;
const sameInquiry = (a, b) => JSON.stringify([a?.source_label, a?.channel, a?.occurred_at]) === JSON.stringify([b?.source_label, b?.channel, b?.occurred_at]);
// The Meta ad behind an inquiry (migration 126): "Publicité · ad set › ad", the campaign
// as small muted text after it; nothing when the read gives no name. Wraps on phones.
function AdSource({ ad }) {
  const label = adSourceLabel(ad);
  if (!label) return null;
  return <div className="break-words"><dt className="inline text-muted-foreground">Publicité · </dt><dd className="inline">{label.main}{label.campaign && <span className="ml-1 text-xs text-muted-foreground">{label.campaign}</span>}</dd></div>;
}
// One user action = one entry (§4.7): the actor's current name (read at display time), the command, the
// summary « avant → après » and the note once. Secondary rows appear with « Détails ».
function HistoryItem({ item }) {
  const title = item.arrival ? 'Nouveau prospect arrivé' : item.is_primary ? COMMAND_LABELS[item.command] || 'Action enregistrée' : EVENTS[item.event_type] || 'Activité enregistrée';
  return <li><p className="text-xs text-muted-foreground">{dateLabel(item.occurred_at)}{item.actor_name && <span className="ml-2">{item.actor_name}</span>}</p><p className="mt-1 text-sm font-medium">{title}{item.outcome && !item.is_primary && !item.event_type.startsWith('call_') ? ` · ${OUTCOMES[item.outcome] || (CLOSE_REASON_LABELS[item.outcome] ?? 'Mise à jour')}` : ''}</p>{item.summary && <p className="mt-1 break-words text-sm text-slate-700">{item.summary}</p>}{item.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{activityBody(item.body)}</p>}{item.secondary_count > 0 && <p className="mt-1 text-xs text-muted-foreground">{item.secondary_count} détail{item.secondary_count > 1 ? 's' : ''} système</p>}</li>;
}
// Routes from lists and the board onto the two next-action forms (§4.9).
const ROUTES = { call: ['exchange', { channel: 'phone' }], no_answer: ['exchange', { channel: 'phone', result: 'no_answer' }], conversation: ['exchange', {}], qualify: ['exchange', { result: 'spoke' }], exchange: ['exchange', {}],
  complete: ['change'], reschedule: ['change'], cancel: ['change'], schedule: ['change'], change: ['change'] };
const routed = name => ROUTES[name] ? { name: ROUTES[name][0], initial: ROUTES[name][1] || {} } : { name, initial: {} };
export default function LeadDetailSheet({
  leadId,
  initialAction,
  initialTask,
  onClose,
  onRestoreFocus,
  onOpenLead
}) {
  const moreRef = useRef(null), menuAction = useRef(null);
  const [enrolling, setEnrolling] = useState(false);
  const [placement, setPlacement] = useState(undefined);
  const [action, setAction] = useState(initialAction && !['enrollment','unsupported'].includes(initialAction) ? {...routed(initialAction),task:initialTask || null} : null),
    [historyCursors, setHistoryCursors] = useState([null]),
    [historyOpen, setHistoryOpen] = useState(false),
    [formOffset, setFormOffset] = useState(0),
    [historyDetails, setHistoryDetails] = useState(false),
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
    p_cursor: historyCursors.at(-1),
    p_details: historyDetails
  });
  const forms = useCrmRead('crm_get_form_answers', {
    p_lead: leadId,
    p_limit: 5,
    p_offset: formOffset
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
  const open = (name, task = null, initial = {}) => {
    setAction({
      name,
      task,
      initial
    });
  };
  // An Autres actions item opens its dialog once the menu has returned focus to its
  // trigger, so closing the dialog returns there too (E2).
  const openFromMenu = (name, task = null) => { menuAction.current = { name, task, initial: {} }; };
  const latest = acquisition.data?.latest_inquiry, first = acquisition.data?.first_inquiry;
  // Outside « Détails », an arrival by Meta or the website reads as one line.
  const historyRows = historyDetails ? history.data?.rows || [] : collapseArrival(history.data?.rows);
  // The programme once (CPO-r2 clean-ups): the prospect's own programme, else what the
  // prospect typed, else the programme a form answer names.
  const formProgramme = !lead?.session_type && !lead?.program_interest_text ? answerProgramme(summaryForms.data?.rows) : null;
  const programme = lead?.session_type ? programmeLabel(lead.session_type) : lead?.program_interest_text || formProgramme || null;
  const programmeTexts = [lead?.session_type, lead?.session_type && programmeLabel(lead.session_type), lead?.program_interest_text, programme];
  const contactIsLearner = lead?.contact?.contact_kind === 'adult_learner' && !lead?.learner_name;
  // « Autres actions »: one menu in the row of the panel's buttons. « Modifier la fiche » and
  // « Ajouter un enfant » are always there; the others belong to an active prospect.
  const moreMenu = lead && !lead.merged_into_lead_id ? <DropdownMenu open={more.open} onOpenChange={more.onOpenChange}><DropdownMenuTrigger asChild><Button ref={moreRef} size="sm" variant="outline" className="min-h-9" aria-label="Autres actions"><MoreHorizontal size={17} /><span className="ml-2 max-sm:sr-only">Autres actions</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={() => { const next = menuAction.current; menuAction.current = null; if (next) setAction(next); }}>
    <DropdownMenuItem onSelect={() => openFromMenu('edit')}>Modifier la fiche</DropdownMenuItem><DropdownMenuItem onSelect={() => openFromMenu('sibling')}>Ajouter un enfant</DropdownMenuItem>
    {active && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => openFromMenu('reassign')}>Changer de responsable</DropdownMenuItem>{lead.next_action && <DropdownMenuItem onSelect={() => openFromMenu('reassign', lead.open_tasks?.find(t => t.id === lead.next_action.id) || lead.next_action)}>Confier cette action à…</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onSelect={() => openFromMenu('close')}>Clôturer le prospect</DropdownMenuItem></>}
  </DropdownMenuContent></DropdownMenu> : null;
  // One Sheet → SheetContent tree for every band: only classes differ. SheetContent does
  // not scroll, so the primitive's single "Fermer" stays pinned above the scrolling body.
  return <Sheet open onOpenChange={value => {
    if (!value) onClose();
  }}><SheetContent onEscapeKeyDown={guard.onEscapeKeyDown} onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus?.(); }} className="operational flex w-full max-w-full flex-col gap-0 overflow-hidden break-words p-0 sm:max-w-[620px] sm:rounded-l-overlay motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none motion-reduce:transition-none">
 {/* Only the name and the line under it keep clear of « Fermer » (pr-10 / sm:pr-8 = the former 56px); the status and contact lines sit below the button and use the full width, so the larger contact line (CPO-r2) stays on one line on a phone. */}
 <div data-drawer-header className="shrink-0 border-b px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5"><SheetHeader className="space-y-1 pr-10 text-left sm:pr-8"><SheetTitle>{lead?.contact_name || 'Prospect'}</SheetTitle><SheetDescription>{lead ? [contactIsLearner ? null : lead.learner_name || 'Apprenant à préciser', lead.learner_age != null ? `${lead.learner_age} ans` : null, programme || 'Programme à préciser'].filter(Boolean).join(' · ') : 'Historique et prochaines étapes'}</SheetDescription></SheetHeader>
  {lead && <><div data-testid="header-status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><LifecycleBadge status={lead.status} />{lead.owner_id ? <span className="text-xs text-muted-foreground">Responsable : {lead.owner_display_label || 'Responsable indisponible'}</span> : active ? <><span className="text-xs font-medium text-amber-900">À prendre</span><TakeProspectButton lead={lead} /></> : <span className="text-xs text-muted-foreground">Sans responsable</span>}</div>
  <p data-testid="header-contact" className="mt-2 break-words text-sm text-foreground"><span className="break-all">Tél. {lead.phone ? formatPhoneFr(lead.phone) : 'Non précisé'}</span> · <span className="break-all">WhatsApp {links.whatsapp ? <a data-testid="header-whatsapp" className="font-medium text-blue-800 underline" href={links.whatsapp} target="_blank" rel="noopener noreferrer">{formatPhoneFr(`+${links.whatsapp.split('/').at(-1)}`)}</a> : 'Indisponible'}</span>{lead.contact.email && <> · <span className="break-all">{lead.contact.email}</span></>}</p></>}
 </div>
 <div data-drawer-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
 <ReadState query={detail} empty="Ce prospect n’est plus disponible.">{lead && <div className="space-y-6">
  {initialAction === 'unsupported' && <p role="status" className="rounded-lg border p-3 text-sm">Ce déplacement n’est pas pris en charge. Qualifiez le projet avant de commencer une inscription ; seules les actions enregistrées changent l’étape.</p>}
  {active ? <NextActionPanel lead={lead} more={moreMenu} onExchange={initial => open('exchange', null, initial)} onChange={() => open('change')} onUnreachable={() => open('unreachable')} />
   : moreMenu && <section aria-label="Autres actions" className="flex flex-wrap gap-2">{moreMenu}</section>}
  <LeadPeopleSection lead={lead} onOpenLead={onOpenLead} />
  {(lead.closure_reason || ['LOST', 'NOT_QUALIFIED'].includes(lead.status)) && <section className="space-y-3">{lead.closure_reason && <p className="text-sm text-slate-600">{closeReasonLabel(lead.closure_reason)}{lead.closure_note ? ` · ${lead.closure_note}` : ''}</p>}{['LOST', 'NOT_QUALIFIED'].includes(lead.status) && <Button onClick={() => open('reopen')}>Rouvrir le prospect</Button>}</section>}
  <section aria-labelledby={`${historyId}-demande`} className="space-y-3 border-t pt-4"><h3 id={`${historyId}-demande`} className="text-base leading-6 font-semibold">Demande</h3>
   <dl className="space-y-1 text-sm" data-testid="lead-catalogue"><div><dt className="inline text-muted-foreground">Programme · </dt><dd className="inline break-words">{programme || 'Programme à préciser'}{formProgramme && <span className="ml-1 text-xs text-muted-foreground">(réponse au formulaire)</span>}</dd></div>
    {lead.session_type && lead.program_interest_text && !sameText(lead.program_interest_text, programme) && !sameText(lead.program_interest_text, lead.session_type) && <div><dt className="inline text-muted-foreground">Précision · </dt><dd className="inline break-words">{lead.program_interest_text}</dd></div>}
    <div><dt className="inline text-muted-foreground">Origine · </dt><dd className="inline break-words">{originLabel(lead.origin_code)}</dd></div>
    {lead.referrer?.label && <div><dt className="inline text-muted-foreground">Recommandé par · </dt><dd className="inline break-words">{lead.referrer.label}</dd></div>}
    <div><dt className="inline text-muted-foreground">Arrivé par · </dt><dd className="inline break-words">{sourceWithoutProgramme(lead.source_label, ...programmeTexts) || 'Non précisé'}</dd></div></dl>
   <ReadState query={acquisition}>{acquisition.data && <dl className="space-y-1 text-sm"><div><dt className="inline text-muted-foreground">Dernière demande · </dt><dd className="inline break-words">{inquiryLabel(latest, programmeTexts)}</dd></div><AdSource ad={latest?.ad} />{first && !sameInquiry(first, latest) && <><div><dt className="inline text-muted-foreground">Première demande · </dt><dd className="inline break-words">{inquiryLabel(first, programmeTexts)}</dd></div><AdSource ad={first?.ad} /></>}</dl>}</ReadState>
   <div><h4 className="mb-1 text-sm font-medium">Résumé de la dernière demande</h4><ReadState query={summaryForms} empty="Aucune réponse complémentaire enregistrée.">{summaryForms.data?.rows?.length ? <div className="space-y-3">{summaryForms.data.rows.slice(0,1).map(sub => <div key={sub.id}><p className="text-xs text-muted-foreground">{sourceWithoutProgramme(sub.source_label, ...programmeTexts) || 'Demande'} · {dateLabel(sub.occurred_at)}</p><dl className="mt-2 space-y-2">{inquirySummary({ ...sub, answers: (sub.answers || []).filter(answer => !(isProgrammeAnswer(answer) && sameText(answerValue(answer), programme))) }).map((answer,i)=><div key={i}><dt className="text-xs text-muted-foreground">{answerLabel(answer)}</dt><dd className="break-words text-sm">{answerValue(answer)}</dd></div>)}</dl></div>)}</div> : null}</ReadState></div>
   <details onToggle={e => setFormsOpen(e.currentTarget.open)}><summary className="cursor-pointer py-2 text-sm font-semibold">Toutes les réponses aux formulaires</summary>{formsOpen && <ReadState query={forms} empty="Aucune réponse enregistrée.">{forms.data?.rows?.length ? forms.data.rows.map(sub => <section key={sub.id} className="mb-4 rounded-lg bg-slate-50 p-4"><p className="text-sm font-medium">{sourceWithoutProgramme(sub.source_label, ...programmeTexts) || 'Demande'}</p><p className="mb-3 text-xs text-muted-foreground">{dateLabel(sub.occurred_at)}</p><dl className="space-y-3">{sub.answers.map((answer, i) => <div key={i}><dt className="text-xs text-slate-500">{answerLabel(answer)}</dt><dd className="mt-1 break-words text-sm">{answerValue(answer)}</dd></div>)}</dl>{!sub.answers.length && <p className="text-sm text-slate-500">Aucune réponse complémentaire.</p>}</section>) : null}</ReadState>}<Pager offset={formOffset} total={forms.data?.total || 0} size={5} onChange={setFormOffset} /></details>
  </section>
  <LeadPlacementSection lead={lead} onOpen={setPlacement} />
  <LeadEnrollmentSection lead={lead} onStart={() => setEnrolling(true)} />
  <section className="border-t pt-4"><h3 className="mb-3 text-base leading-6 font-semibold">Historique</h3><div id={historyId}><ReadState query={history} empty="Aucun échange enregistré.">{historyRows.length ? historyOpen ? <ol className="space-y-4 border-l border-slate-200 pl-5">{historyRows.map(item => <HistoryItem key={item.id} item={item} />)}</ol> : <><p className="mb-3 text-xs font-medium text-muted-foreground">Derniers échanges</p><ol className="space-y-4 border-l border-slate-200 pl-5">{historySummary(historyRows).map(item => <HistoryItem key={item.id} item={item} />)}</ol></> : null}</ReadState></div>
   {(historyRows.length > 0 || historyOpen) && <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" aria-expanded={historyOpen} aria-controls={historyId} onClick={() => { setHistoryCursors([null]); setHistoryOpen(x => !x); }}>{historyOpen ? 'Afficher les derniers échanges' : 'Afficher tout l’historique'}</Button>{historyOpen && <><Button variant="outline" aria-pressed={historyDetails} onClick={() => { setHistoryCursors([null]); setHistoryDetails(x => !x); }}>{historyDetails ? 'Masquer les détails' : 'Détails'}</Button><Button variant="outline" disabled={historyCursors.length === 1} onClick={() => setHistoryCursors(x => x.slice(0,-1))}>Plus récents</Button><Button variant="outline" disabled={!history.data?.has_more} onClick={() => setHistoryCursors(x => [...x,history.data.next_cursor])}>Charger les plus anciens</Button></>}</div>}</section>
 </div>}</ReadState>
 </div>
 {action?.name === 'exchange' && lead && <ExchangeDialog key={`exchange:${JSON.stringify(action.initial)}`} lead={lead} initial={action.initial} onClose={() => setAction(null)} />}
 {action?.name === 'change' && lead && <NextActionDialog lead={lead} onClose={() => setAction(null)} />}
 {action?.name === 'edit' && lead && <ProspectEditDialog lead={lead} onClose={() => setAction(null)} />}
 {action?.name === 'sibling' && lead && <CrmActionDialog action="manual" contact={{ id: lead.contact_id || lead.contact?.id, display_name: lead.contact_name, phone_masked: maskPhone(lead.contact?.phone) }} onClose={() => setAction(null)} onCreated={id => { setAction(null); onOpenLead?.(id); }} returnFocusRef={moreRef} />}
 {action && !['exchange', 'change', 'edit', 'sibling'].includes(action.name) && lead && <CrmActionDialog key={`${action.name}:${action.task?.id || ''}`} action={action.name} lead={lead} task={action.task} onClose={() => setAction(null)} returnFocusRef={moreRef} />}
 {placement !== undefined && lead && <PlacementTestModal key={placement?.id || 'booking'} test={placement} crmLead={lead} onSave={() => setPlacement(undefined)} onClose={() => setPlacement(undefined)} />}
 {enrolling && lead && <CrmEnrollmentDialog lead={lead} onClose={() => setEnrolling(false)} />}
 </SheetContent></Sheet>;
}

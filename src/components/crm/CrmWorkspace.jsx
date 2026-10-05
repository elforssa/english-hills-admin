'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Plus, Phone, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { ACTIVE, STATUS, TASKS, UUID, dateLabel, phoneLinks } from '@/lib/crm/presentation.mjs';
import { LifecycleBadge, Pager, ReadState } from './CrmShared';
import LeadDetailSheet from './LeadDetailSheet';
import CrmActionDialog from './CrmActionDialog';
import CrmIntakeReview from './CrmIntakeReview';
import OpportunitiesBoard from './OpportunitiesBoard';
import OpportunitiesList from './OpportunitiesList';
import OpportunityFilters from './OpportunityFilters';
const priorities = {
  1: 'En retard',
  2: 'Premier contact',
  3: 'Action du jour',
  4: 'Prochaine action manquante',
  5: 'Contact à relancer'
};
function LeadRow({
  lead,
  onOpen,
  queue
}) {
  const links = phoneLinks(lead);
  return <article className="group border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5 sm:py-3" data-testid="lead-row">
  <div className="flex flex-wrap items-start justify-between gap-2"><button className="min-w-0 text-left focus-visible:outline-blue-600" onClick={() => onOpen(lead.id)}><span className="block text-sm font-semibold leading-5 text-slate-900 group-hover:text-blue-800">{lead.contact_name}</span><span className="mt-0.5 block text-xs leading-4 text-slate-500">{lead.learner_name || 'Apprenant à préciser'}{lead.learner_age != null ? ` · ${lead.learner_age} ans` : ''}{lead.program ? ` · ${lead.program}` : ''}</span></button><LifecycleBadge status={lead.status} /></div>
  {queue && <p className={`mt-1.5 text-sm font-semibold ${lead.priority === 1 ? 'text-red-700' : 'text-blue-800'}`}>{lead.next_task?.task_type === 'post_test_followup' ? 'Résultat du test disponible' : !lead.next_task && lead.failed_attempts >= 5 ? '5 appels infructueux effectués' : lead.priority === 3 && lead.next_task?.task_type === 'callback' ? 'Rappel' : priorities[lead.priority]}{lead.stale && lead.priority !== 5 ? ' · Contact à relancer' : ''}</p>}
  <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm"><p className="font-medium text-slate-700">{lead.next_task?.task_type === 'post_test_followup' && lead.post_test_result ? `${lead.learner_name} · ${lead.post_test_result.niveau_recommande} — Rappeler le parent` : lead.next_task ? `${TASKS[lead.next_task.task_type] || 'Action'} · ${dateLabel(lead.next_task.due_at)}` : lead.next_placement ? `Test de niveau · ${dateLabel(lead.next_placement.scheduled_for)}` : ACTIVE.includes(lead.status) ? lead.failed_attempts >= 5 ? 'Prévoir un appel ou clôturer le suivi' : 'Choisir une prochaine action' : 'Suivi clos'}</p>{lead.last_activity && <p className="text-xs text-slate-400">Mis à jour · {dateLabel(lead.last_activity.occurred_at)}</p>}</div>
  <div className="mt-1.5 flex flex-wrap items-center gap-2">{ACTIVE.includes(lead.status) && links.tel && <a className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm hover:bg-slate-50" href={links.tel}><Phone size={14} />Appeler</a>}{ACTIVE.includes(lead.status) && links.whatsapp && <a className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm hover:bg-slate-50" href={links.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a>}<Button size="sm" variant="ghost" className="min-h-11" onClick={() => onOpen(lead.id)}>Voir</Button></div>
 </article>;
}
export default function CrmWorkspace({
  mode
}) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const selected = UUID.test(params.get('lead') || '') ? params.get('lead') : null;
  const contact = UUID.test(params.get('contact') || '') ? params.get('contact') : null;
  const originFocus = useRef(null), headingRef = useRef(null), navigationLead = useRef(selected);
  useEffect(() => { navigationLead.current = selected; }, [selected]);
  const [initialAction, setInitialAction] = useState(null);
  const [smallScreen, setSmallScreen] = useState(false);
  useEffect(() => { const media = window.matchMedia('(max-width: 767px)'); const update = () => setSmallScreen(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const filters = Object.fromEntries(['view','q','owner','channel','source','program','stage'].map(key => [key, params.get(key) ?? ({view:'all',owner:'all'}[key] || '')]));
  const preferredLayout = params.get('layout') || (smallScreen ? 'list' : 'board');
  const layout = filters.view === 'closed' ? 'list' : preferredLayout;
  const [cursors, setCursors] = useState([null]);
  const cursorFilter = useRef(null);
  const [generation, setGeneration] = useState(0);
  const filterKey = JSON.stringify([filters, layout, contact]);
  useEffect(() => { setCursors([null]); cursorFilter.current = filterKey; }, [filterKey]);
  function setFilter(key, value) {
    const next = new URLSearchParams(params.toString());
    // Preserve a drawer navigation already requested while search is debouncing.
    if (navigationLead.current) next.set('lead',navigationLead.current); else next.delete('lead');
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'source' && value) { try { next.set('channel', JSON.parse(value).kind); } catch { /* Server rejects invalid facets. */ } }
    if (key === 'channel') next.delete('source');
    if (key !== 'lead') { next.delete('stage'); setCursors([null]); }
    if (key === 'stage' && value) next.set(key, value);
    router.replace(`${pathname}?${next}`, {scroll:false});
  }
  const parseFacet = value => { try { return value ? JSON.parse(value) : null; } catch { return {kind:'invalid',value:'invalid'}; } };
  const source = parseFacet(filters.source), program = parseFacet(filters.program);
  const args = {p_view:filters.view,p_query:filters.q,p_contact:contact,p_owner_mode:['all','me','unassigned'].includes(filters.owner) ? filters.owner : 'staff',p_owner:UUID.test(filters.owner) ? filters.owner : null,p_channel:filters.channel || source?.kind || null,p_source_label:source?.value || null,p_program_kind:program?.kind === 'unspecified' ? 'unspecified' : program?.kind || 'all',p_program:program?.value || null,p_layout:layout,p_stage:layout === 'list' ? filters.stage || null : null,p_limit:25};
  const opportunities = useCrmRead('crm_get_opportunities', {...args,p_cursor:cursorFilter.current === filterKey ? cursors.at(-1) : null}, mode === 'leads');
  const [offset, setOffset] = useState(0),
    [scheduleOffset, setScheduleOffset] = useState(0),
    [manual, setManual] = useState(false);
  useEffect(() => {
    const reset = () => { setOffset(0); setScheduleOffset(0); setCursors([null]); setGeneration(x => x + 1); };
    window.addEventListener('crm:refresh', reset);
    return () => window.removeEventListener('crm:refresh', reset);
  }, []);
  const today = useCrmRead('crm_get_today', {
    p_limit: 25,
    p_offset: offset,
    p_schedule_offset: scheduleOffset
  }, mode === 'today');
  function selectLead(id) {
    navigationLead.current = id;
    const next = new URLSearchParams(params.toString());
    if (id) { originFocus.current = document.activeElement; next.set('lead', id); } else { next.delete('lead'); setInitialAction(null); }
    router.push(`${pathname}${next.size ? '?' + next : ''}`, {
      scroll: false
    });
  }
  function routeAction(id, name) { setInitialAction(name); selectLead(id); }
  const counts = today.data?.counts;
  const opportunityPage = opportunities.data?.pages?.[filters.stage || 'list'];
  const matchedCount = layout === 'list' && filters.stage ? opportunities.data?.counts?.[filters.stage] : opportunities.data?.total;
  const closedCount = (opportunities.data?.counts?.LOST || 0) + (opportunities.data?.counts?.NOT_QUALIFIED || 0);
  return <div className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-5 sm:px-6">
  <header className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">Accueil · English Hills</p><h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight text-slate-900">{mode === 'today' ? 'Aujourd’hui' : 'Pipeline admissions'}</h1><p className="mt-2 text-sm text-slate-500">{mode === 'today' ? 'Les personnes à rappeler. Les prochaines étapes à préparer.' : 'Retrouvez un parent et reprenez la conversation.'}</p></div><Button onClick={() => setManual(true)}><Plus size={16} className="mr-2" />Ajouter un prospect</Button></header>
  {mode === 'today' ? <>
   <CrmIntakeReview />
   <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['new', 'Nouveaux prospects'], ['overdue', 'Actions en retard'], ['callbacks', 'Rappels du jour'], ['due_today', 'Actions du jour']].map(([key, label]) => <div key={key} className="rounded-xl border bg-white px-5 py-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-3xl font-semibold tabular-nums ${key === 'overdue' && counts?.[key] ? 'text-red-700' : 'text-slate-900'}`}>{counts?.[key] ?? '—'}</p></div>)}</div>
   <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]"><section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">À traiter en priorité</h2><span className="text-xs text-slate-500">{today.data?.attention_total ?? '—'} prospects</span></div><div className="overflow-hidden rounded-xl border bg-white"><ReadState query={today} empty="Rien ne demande votre attention pour le moment.">{today.data?.needs_attention?.length ? today.data.needs_attention.map(lead => <LeadRow key={lead.id} lead={lead} onOpen={selectLead} queue />) : null}</ReadState><Pager offset={offset} total={today.data?.attention_total || 0} size={25} onChange={setOffset} /></div></section>
   <section><h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><CalendarDays size={18} />Agenda du jour</h2><div className="rounded-xl border bg-white"><ReadState query={today} empty="Aucune action prévue aujourd’hui.">{today.data?.today_schedule?.length ? today.data.today_schedule.map(task => <button key={`${task.kind}:${task.id}`} onClick={() => selectLead(task.lead.id)} className="block w-full border-b p-4 text-left last:border-0 hover:bg-slate-50"><span className="text-xs font-semibold text-blue-800">{dateLabel(task.due_at)}</span><span className="mt-1 block font-medium">{task.kind === 'placement' ? task.lead.learner_name : task.lead.contact_name}</span><span className="text-sm text-slate-500">{task.kind === 'placement' ? `Test de niveau · Parent : ${task.lead.contact_name}` : TASKS[task.task_type] || 'Action'}</span><span className="mt-1 block text-xs text-slate-500">Voir</span></button>) : null}</ReadState><Pager offset={scheduleOffset} total={today.data?.schedule_total || 0} size={25} onChange={setScheduleOffset} /></div><p className="mt-3 text-xs text-slate-400">Heures de Casablanca · Les actions du jour incluent les rappels</p></section></div>
  </> : <section className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-500">{matchedCount ?? '—'} prospects correspondants</p><div className="flex gap-1"><Button variant={layout === 'board' ? 'default' : 'outline'} disabled={filters.view === 'closed'} aria-pressed={layout === 'board'} onClick={() => setFilter('layout','board')}>Tableau</Button><Button variant={layout === 'list' ? 'default' : 'outline'} aria-pressed={layout === 'list'} onClick={() => setFilter('layout','list')}>Liste</Button></div></div>
    <OpportunityFilters filters={filters} setFilter={setFilter} layout={layout} />
    {contact && <p className="text-sm">Opportunités de ce contact · Les apprenants restent séparés. <Button variant="link" onClick={() => { const next = new URLSearchParams(params.toString()); next.delete('contact'); router.replace(`${pathname}?${next}`, {scroll:false}); }}>Tous les contacts</Button></p>}
    {filters.view === 'closed' ? <p className="text-xs text-slate-500">Les clôtures sont affichées en Liste. Choisissez une autre vue pour accéder au Tableau.</p> : layout === 'board' && <p className="text-xs text-slate-500">Le Tableau montre les opportunités ouvertes et converties. <Button variant="link" className="px-1" onClick={() => setFilter('view','closed')}>Clôturés : {closedCount}</Button> · Inclus dans le total ; visibles en Liste.</p>}
    <div role="status" className="sr-only">Les vues sont actualisées après chaque action ; les prospects qui ne correspondent plus aux filtres quittent la vue.</div>
    {layout === 'board' ? <OpportunitiesBoard key={filterKey + generation} query={opportunities} args={args} onOpen={selectLead} onAction={routeAction} /> : <><OpportunitiesList query={opportunities} stage={filters.stage} onOpen={selectLead} onAction={routeAction} /><div className="flex gap-2"><Button variant="outline" disabled={cursors.length === 1} onClick={() => setCursors(x => x.slice(0,-1))}>Précédents</Button><Button variant="outline" disabled={!opportunityPage?.has_more} onClick={() => setCursors(x => [...x,opportunityPage.next_cursor])}>Suivants</Button></div></>}
  </section>}

  {selected && <LeadDetailSheet key={`${selected}:${initialAction || "detail"}`} leadId={selected} initialAction={initialAction} onRestoreFocus={() => { (originFocus.current?.isConnected ? originFocus.current : headingRef.current)?.focus(); }} onClose={() => selectLead(null)} />}
  {manual && <CrmActionDialog action="manual" onClose={() => setManual(false)} onCreated={id => {
      setManual(false);
      selectLead(id);
    }} onCandidate={id => {
      setManual(false);
      router.push(`/crm/leads?contact=${id}`);
    }} />}
 </div>;
}

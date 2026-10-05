'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { UUID } from '@/lib/crm/presentation.mjs';
import LeadDetailSheet from './LeadDetailSheet';
import CrmActionDialog from './CrmActionDialog';
import WorkQueue from './WorkQueue';
import OpportunitiesBoard from './OpportunitiesBoard';
import OpportunitiesList from './OpportunitiesList';
import OpportunityFilters from './OpportunityFilters';
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
  const [initialAction, setInitialAction] = useState(null), [initialTask, setInitialTask] = useState(null);
  useEffect(() => { if (!selected) { setInitialAction(null); setInitialTask(null); } }, [selected]);
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
  const [manual, setManual] = useState(false);
  useEffect(() => {
    const reset = () => { setCursors([null]); setGeneration(x => x + 1); };
    window.addEventListener('crm:refresh', reset);
    return () => window.removeEventListener('crm:refresh', reset);
  }, []);
  function selectLead(id) {
    navigationLead.current = id;
    const next = new URLSearchParams(params.toString());
    if (id) { originFocus.current = document.activeElement; next.set('lead', id); } else { next.delete('lead'); setInitialAction(null); setInitialTask(null); }
    router.push(`${pathname}${next.size ? '?' + next : ''}`, {
      scroll: false
    });
  }
  function openLead(id) { setInitialAction(null); setInitialTask(null); selectLead(id); }
  function routeAction(id, name, task = null) { setInitialAction(name); setInitialTask(task); selectLead(id); }
  const opportunityPage = opportunities.data?.pages?.[filters.stage || 'list'];
  const matchedCount = layout === 'list' && filters.stage ? opportunities.data?.counts?.[filters.stage] : opportunities.data?.total;
  const closedCount = (opportunities.data?.counts?.LOST || 0) + (opportunities.data?.counts?.NOT_QUALIFIED || 0);
  return <div className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-5 sm:px-6">
  <header className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">Accueil · English Hills</p><h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight text-slate-900">{mode === 'today' ? 'Tâches · Mon travail' : 'Pipeline admissions'}</h1><p className="mt-2 text-sm text-slate-500">{mode === 'today' ? 'Vos prochaines actions, une tâche à la fois.' : 'Retrouvez un parent et reprenez la conversation.'}</p></div><Button onClick={() => setManual(true)}><Plus size={16} className="mr-2" />Ajouter un prospect</Button></header>
  {mode === 'today' ? <WorkQueue params={params} setFilter={setFilter} onOpen={openLead} onAction={routeAction} /> : <section className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-500">{matchedCount ?? '—'} prospects correspondants</p><div className="flex gap-1"><Button variant={layout === 'board' ? 'default' : 'outline'} disabled={filters.view === 'closed'} aria-pressed={layout === 'board'} onClick={() => setFilter('layout','board')}>Tableau</Button><Button variant={layout === 'list' ? 'default' : 'outline'} aria-pressed={layout === 'list'} onClick={() => setFilter('layout','list')}>Liste</Button></div></div>
    <OpportunityFilters filters={filters} setFilter={setFilter} layout={layout} />
    {contact && <p className="text-sm">Opportunités de ce contact · Les apprenants restent séparés. <Button variant="link" onClick={() => { const next = new URLSearchParams(params.toString()); next.delete('contact'); router.replace(`${pathname}?${next}`, {scroll:false}); }}>Tous les contacts</Button></p>}
    {filters.view === 'closed' ? <p className="text-xs text-slate-500">Les clôtures sont affichées en Liste. Choisissez une autre vue pour accéder au Tableau.</p> : layout === 'board' && <p className="text-xs text-slate-500">Le Tableau montre les opportunités ouvertes et converties. <Button variant="link" className="px-1" onClick={() => setFilter('view','closed')}>Clôturés : {closedCount}</Button> · Inclus dans le total ; visibles en Liste.</p>}
    <div role="status" className="sr-only">Les vues sont actualisées après chaque action ; les prospects qui ne correspondent plus aux filtres quittent la vue.</div>
    {layout === 'board' ? <OpportunitiesBoard key={filterKey + generation} query={opportunities} args={args} onOpen={openLead} onAction={routeAction} /> : <><OpportunitiesList query={opportunities} stage={filters.stage} onOpen={openLead} onAction={routeAction} /><div className="flex gap-2"><Button variant="outline" disabled={cursors.length === 1} onClick={() => setCursors(x => x.slice(0,-1))}>Précédents</Button><Button variant="outline" disabled={!opportunityPage?.has_more} onClick={() => setCursors(x => [...x,opportunityPage.next_cursor])}>Suivants</Button></div></>}
  </section>}

  {selected && <LeadDetailSheet key={`${selected}:${initialAction || "detail"}`} leadId={selected} initialAction={initialAction} initialTask={initialTask} onRestoreFocus={() => { (originFocus.current?.isConnected ? originFocus.current : headingRef.current)?.focus(); }} onClose={() => selectLead(null)} />}
  {manual && <CrmActionDialog action="manual" onClose={() => setManual(false)} onCreated={id => {
      setManual(false);
      selectLead(id);
    }} onCandidate={id => {
      setManual(false);
      router.push(`/crm/leads?contact=${id}`);
    }} />}
 </div>;
}

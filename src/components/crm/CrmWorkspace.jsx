'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import PageFrame from '@/components/operational/PageFrame';
import PageHeader from '@/components/operational/PageHeader';
import CursorPager from '@/components/operational/CursorPager';
import { Columns3, List, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { STATUS, UUID, resolvePresentation, stageChips } from '@/lib/crm/presentation.mjs';
import { retryingImport } from '@/lib/retryingImport.mjs';
import LazyOverlay from './LazyOverlay';
import WorkQueue from './WorkQueue';
import OpportunitiesBoard from './OpportunitiesBoard';
import OpportunitiesList from './OpportunitiesList';
import OpportunityFilters from './OpportunityFilters';
import ScrollRow from './ScrollRow';
import useResponsiveBand from './useResponsiveBand';
// The drawer and the manual-create dialog are needed only after a click. Load them
// as separate chunks, prefetched once the page is idle so the first open is not slower.
const leadDetailSheet = retryingImport(() => import('./LeadDetailSheet'));
const crmActionDialog = retryingImport(() => import('./CrmActionDialog'));
// Navigation only: a chip sets the existing stage filter; counts are display data.
function StageChips({ view, stage, counts, total, onSelect }) {
  const count = value => Number.isFinite(value) ? value : '—';
  return <ScrollRow role="group" aria-label="Étapes">
    <Button type="button" variant={stage ? 'outline' : 'default'} className="shrink-0" aria-pressed={!stage} onClick={() => onSelect('')}>Tous <span className="tabular-nums">{count(total)}</span></Button>
    {stageChips(view, stage).map(key => <Button key={key} type="button" variant={stage === key ? 'default' : 'outline'} className="shrink-0" aria-pressed={stage === key} onClick={() => onSelect(key)}>{STATUS[key]} <span className="tabular-nums">{count(counts?.[key])}</span></Button>)}
  </ScrollRow>;
}
export default function CrmWorkspace({
  mode
}) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const selected = UUID.test(params.get('lead') || '') ? params.get('lead') : null;
  const contact = UUID.test(params.get('contact') || '') ? params.get('contact') : null;
  const originFocus = useRef(null), headingRef = useRef(null), manualOrigin = useRef(null);
  const restoreLeadFocus = () => { (originFocus.current?.isConnected ? originFocus.current : headingRef.current)?.focus(); };
  const [initialAction, setInitialAction] = useState(null), [initialTask, setInitialTask] = useState(null);
  useEffect(() => { if (!selected) { setInitialAction(null); setInitialTask(null); } }, [selected]);
  useEffect(() => {
    // Best effort: a prefetch cancelled by navigation is not an error; opening retries the load.
    const prefetch = () => { leadDetailSheet.load().catch(() => {}); crmActionDialog.load().catch(() => {}); };
    if ('requestIdleCallback' in window) { const id = window.requestIdleCallback(prefetch, { timeout: 3000 }); return () => window.cancelIdleCallback(id); }
    const id = window.setTimeout(prefetch, 1500); return () => window.clearTimeout(id);
  }, []);
  // Shared sm/lg queries decide the band; the default moves from 768 to the lg board (D7).
  const band = useResponsiveBand({ stableScrollbar: mode === 'leads' });
  const filters = Object.fromEntries(['view','q','owner','channel','source','program','stage'].map(key => [key, params.get(key) ?? ({view:'all',owner:'all'}[key] || '')]));
  const preferredLayout = params.get('layout') || (band === 'desktop' ? 'board' : 'list');
  const layout = filters.view === 'closed' ? 'list' : preferredLayout;
  const presentation = band ? resolvePresentation({ band, layout }) : undefined;
  const [cursors, setCursors] = useState([null]);
  const cursorFilter = useRef(null);
  const [generation, setGeneration] = useState(0);
  const filterKey = JSON.stringify([filters, layout, contact]);
  useEffect(() => { setCursors([null]); cursorFilter.current = filterKey; }, [filterKey]);
  function setFilter(key, value) {
    const next = new URLSearchParams(window.location.search);
    // Native history commits synchronously and Next observes useSearchParams.
    // A debounced callback composes with every edit/navigation already committed.
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'source' && value) { try { next.set('channel', JSON.parse(value).kind); } catch { /* Server rejects invalid facets. */ } }
    if (key === 'channel') next.delete('source');
    if (key !== 'lead') setCursors([null]);
    if (key === 'stage' && value) next.set(key, value);
    window.history.replaceState(null, '', `${pathname}?${next}`);
  }
  function resetFilters() {
    const next = new URLSearchParams(window.location.search);
    ['q','owner','channel','source','program','stage','contact'].forEach(key => next.delete(key));
    if (mode === 'today') next.delete('assignee');
    setCursors([null]);
    window.history.replaceState(null, '', `${pathname}${next.size ? '?' + next : ''}`);
    window.dispatchEvent(new Event('crm:filter-reset'));
  }
  const parseFacet = value => { try { return value ? JSON.parse(value) : null; } catch { return {kind:'invalid',value:'invalid'}; } };
  const source = parseFacet(filters.source), program = parseFacet(filters.program);
  const args = {p_view:filters.view,p_query:filters.q,p_contact:contact,p_owner_mode:['all','me','unassigned'].includes(filters.owner) ? filters.owner : 'staff',p_owner:UUID.test(filters.owner) ? filters.owner : null,p_channel:filters.channel || source?.kind || null,p_source_label:source?.value || null,p_program_kind:program?.kind === 'unspecified' ? 'unspecified' : program?.kind || 'all',p_program:program?.value || null,p_layout:layout,p_stage:layout === 'list' ? filters.stage || null : null,p_limit:25};
  // Read once the band is known, so a phone never fetches the desktop board default first.
  const opportunities = useCrmRead('crm_get_opportunities', {...args,p_cursor:cursorFilter.current === filterKey ? cursors.at(-1) : null}, mode === 'leads' && !!band);
  const [manual, setManual] = useState(false);
  // Kept for the dialog's focus return: a loading shell may hold focus when it mounts.
  const openManual = () => { manualOrigin.current = document.activeElement; setManual(true); };
  // Board scroll is presentation state kept outside the keyed board subtree (never URL/query/storage).
  const boardRegion = useRef(null), boardScroll = useRef(null), currentFilterKey = useRef(filterKey);
  currentFilterKey.current = filterKey;
  useEffect(() => {
    const reset = () => {
      const region = boardRegion.current;
      boardScroll.current = region ? { filterKey: currentFilterKey.current, left: region.scrollLeft, top: region.scrollTop } : null;
      setCursors([null]); setGeneration(x => x + 1);
    };
    window.addEventListener('crm:refresh', reset);
    return () => window.removeEventListener('crm:refresh', reset);
  }, []);
  function selectLead(id) {
    const next = new URLSearchParams(window.location.search);
    if (id) { originFocus.current = document.activeElement; next.set('lead', id); } else { next.delete('lead'); setInitialAction(null); setInitialTask(null); }
    window.history.pushState(null, '', `${pathname}${next.size ? '?' + next : ''}`);
  }
  function openLead(id) { setInitialAction(null); setInitialTask(null); selectLead(id); }
  function routeAction(id, name, task = null) { setInitialAction(name); setInitialTask(task); selectLead(id); }
  const opportunityPage = opportunities.data?.pages?.[filters.stage || 'list'];
  const matchedCount = layout === 'list' && filters.stage ? opportunities.data?.counts?.[filters.stage] : opportunities.data?.total;
  const counts = opportunities.data?.counts;
  const closedCount = Number.isFinite(counts?.LOST) && Number.isFinite(counts?.NOT_QUALIFIED) ? counts.LOST + counts.NOT_QUALIFIED : '—';
  const filtered = filters.view !== 'all' || !!contact || Object.entries(filters).some(([key,value]) => !['view','owner'].includes(key) && value) || filters.owner !== 'all';
  const closedHref = () => { const next = new URLSearchParams(params.toString()); next.set('view', 'closed'); return `${pathname}?${next}`; };
  const toggle = <div role="group" aria-label="Présentation" className="flex shrink-0 gap-1"><Button variant={layout === 'board' ? 'default' : 'outline'} disabled={filters.view === 'closed'} aria-pressed={layout === 'board'} onClick={() => setFilter('layout','board')}><Columns3 size={16} /><span className="max-sm:sr-only">Tableau</span></Button><Button variant={layout === 'list' ? 'default' : 'outline'} aria-pressed={layout === 'list'} onClick={() => setFilter('layout','list')}><List size={16} /><span className="max-sm:sr-only">Liste</span></Button></div>;
  // The count line replaces the former count row and board notice.
  const countLine = <p><span className="tabular-nums">{matchedCount ?? '—'}</span> prospects correspondants{filters.view === 'closed' ? ' · Les clôtures sont affichées en Liste.' : <> · <a className="font-medium text-blue-800 underline underline-offset-4" href={closedHref()} onClick={event => { event.preventDefault(); setFilter('view','closed'); }}><span className="tabular-nums">{closedCount}</span> clôturés</a> (Liste)</>}</p>;
  return <PageFrame width="wide" data-band={band || undefined} data-presentation={mode === 'leads' ? presentation : undefined}>
  {mode === 'today' ? <PageHeader headingRef={headingRef} title="Tâches · Mon travail" description="Vos prochaines actions, une tâche à la fois." actions={<Button onClick={openManual}><Plus size={16} />Ajouter un prospect</Button>} />
    : <PageHeader compact headingRef={headingRef} title="Pipeline admissions" description={countLine} actions={<>{band === 'desktop' && toggle}<Button onClick={openManual}><Plus size={16} /><span>Ajouter<span className="max-sm:sr-only"> un prospect</span></span></Button></>} />}
  {mode === 'today' ? <WorkQueue params={params} setFilter={setFilter} onReset={resetFilters} onOpen={openLead} onAction={routeAction} /> : <section className="min-w-0 space-y-2">
    <OpportunityFilters filters={filters} setFilter={setFilter} layout={layout} contact={contact} band={band} toggle={band && band !== 'desktop' ? toggle : null} onReset={resetFilters} />
    {contact && <p className="text-sm">Opportunités de ce contact · Les apprenants restent séparés. <Button variant="link" onClick={() => { const next = new URLSearchParams(window.location.search); next.delete('contact'); window.history.replaceState(null, '', `${pathname}?${next}`); }}>Tous les contacts</Button></p>}
    {presentation === 'stage-list' && <StageChips view={filters.view} stage={filters.stage} counts={counts} total={opportunities.data?.total} onSelect={value => setFilter('stage', value)} />}
    <div role="status" className="sr-only">Les vues sont actualisées après chaque action ; les prospects qui ne correspondent plus aux filtres quittent la vue.</div>
    {layout === 'board' ? <OpportunitiesBoard key={filterKey + generation} query={opportunities} filtered={filtered} onReset={resetFilters} args={args} onOpen={openLead} onAction={routeAction} regionRef={boardRegion} restore={boardScroll} filterKey={filterKey} /> : <div className="space-y-3 pt-1"><OpportunitiesList query={opportunities} filtered={filtered} onReset={resetFilters} stage={filters.stage} onOpen={openLead} onAction={routeAction} /><CursorPager hasPrevious={cursors.length > 1} hasMore={opportunityPage?.has_more} pending={opportunities.isFetching} onPrevious={() => setCursors(x => x.slice(0,-1))} onNext={() => setCursors(x => [...x,opportunityPage.next_cursor])} /></div>}
  </section>}

  {selected && <LazyOverlay key={`${selected}:${initialAction || "detail"}`} loader={leadDetailSheet} kind="lead" onClose={() => selectLead(null)} onRestoreFocus={restoreLeadFocus}>
    {LeadDetailSheet => <LeadDetailSheet leadId={selected} initialAction={initialAction} initialTask={initialTask} onRestoreFocus={restoreLeadFocus} onClose={() => selectLead(null)} />}
  </LazyOverlay>}
  {manual && <LazyOverlay loader={crmActionDialog} kind="form" onClose={() => setManual(false)} onRestoreFocus={() => manualOrigin.current?.focus()}>
    {CrmActionDialog => <CrmActionDialog action="manual" returnFocusRef={manualOrigin} onClose={() => setManual(false)} onCreated={id => {
      setManual(false);
      selectLead(id);
    }} onCandidate={id => {
      setManual(false);
      router.push(`/crm/leads?contact=${id}`);
    }} />}
  </LazyOverlay>}
 </PageFrame>;
}

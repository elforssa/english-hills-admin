'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { useCrmRead } from '@/lib/crm/queries';
import { BOARD_STAGES, STATUS, opportunityAction, restoredScroll } from '@/lib/crm/presentation.mjs';
import { Button } from '@/components/ui/button';
import { ReadState } from './CrmShared';
import OpportunityCard from './OpportunityCard';
import { EdgeFades, useOverflowEdges } from './ScrollRow';
function Column({ stage, initial, args, count, onOpen, onAction, dragging, asOf }) {
  const [cursors, setCursors] = useState([null]);
  const cursor = cursors.at(-1);
  const query = useCrmRead('crm_get_opportunities', { ...args, p_stage: stage, p_cursor: cursor }, !!cursor);
  const page = cursor ? query.data?.pages?.[stage] : initial;
  return <section aria-label={STATUS[stage]} data-board-stage={stage} className={`min-w-0 rounded-lg bg-slate-100 px-1.5 pb-1.5 ${dragging && ![null,'unsupported'].includes(opportunityAction(dragging,stage)) ? 'ring-2 ring-blue-300' : ''}`} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={e => {
    e.preventDefault();
    try { const lead = JSON.parse(e.dataTransfer.getData('application/eh-opportunity')); const action = opportunityAction(lead.status, stage); if (action) onAction(lead.id, action); } catch { /* Ignore foreign drag data. */ }
  }}><header className="sticky top-0 z-10 -mx-1.5 flex items-center justify-between gap-2 rounded-t-lg bg-slate-100 px-3 py-2"><h2 className="min-w-0 break-words text-base leading-6 font-semibold">{STATUS[stage]}</h2><span className="text-sm tabular-nums text-slate-600">{query.data?.counts?.[stage] ?? count ?? '—'}</span></header>
    {cursor && <ReadState query={query} />}
    <div className="space-y-2">{page?.rows?.map(lead => <OpportunityCard key={lead.id} lead={lead} onOpen={onOpen} onAction={onAction} asOf={asOf} />)}</div>
    {page && !page.rows.length && <p className="px-1 py-8 text-center text-xs text-slate-500">Aucun prospect</p>}
    <div className="mt-2 flex gap-1">{cursors.length > 1 && <Button variant="ghost" className="min-h-9 text-xs" onClick={() => setCursors(x => x.slice(0, -1))}>Précédents</Button>}{page?.has_more && <Button variant="ghost" className="min-h-9 text-xs" onClick={() => setCursors(x => [...x, page.next_cursor])}>Voir les suivants</Button>}</div>
  </section>;
}
// Mounts only once the board's data has rendered, so a saved scroll position can be
// restored against real dimensions. Paging and refresh semantics stay with the parent.
function BoardRegion({ data, args, onOpen, onAction, regionRef, restore, filterKey }) {
  const [dragging,setDragging] = useState(null);
  const ref = useRef(null), edges = useOverflowEdges(ref);
  useLayoutEffect(() => {
    const el = ref.current;
    // Fill the remaining viewport; CSS applies it only at lg with ≥640px of height.
    const fit = () => el.style.setProperty('--board-fill', `${Math.max(360, Math.floor(window.innerHeight - el.getBoundingClientRect().top - window.scrollY - 24))}px`);
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(document.body);
    window.addEventListener('resize', fit);
    return () => { observer?.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (regionRef) regionRef.current = el;
    const saved = restore?.current;
    if (restore) restore.current = null;
    const next = restoredScroll(saved, filterKey, el);
    if (next) { el.scrollLeft = next.left; el.scrollTop = next.top; }
    return () => { if (regionRef?.current === el) regionRef.current = null; };
  // Once per mount: a refresh remounts the board and saves a new position first.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Stage navigation only scrolls this region; it never filters or commands.
  function jump(stage) {
    const el = ref.current, column = el?.querySelector(`[data-board-stage="${stage}"]`);
    if (!column) return;
    const left = el.scrollLeft + column.getBoundingClientRect().left - el.getBoundingClientRect().left - 8;
    el.scrollTo({ left: Math.max(0, left), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  return <div className="min-w-0 space-y-2">
    {edges.overflow && <div role="group" aria-label="Aller à l’étape" className="flex flex-wrap items-center gap-1"><span aria-hidden className="mr-1 text-xs text-muted-foreground">Aller à l’étape</span>{BOARD_STAGES.map(stage => <Button key={stage} type="button" variant="outline" size="sm" className="min-h-9 text-xs" aria-label={`Aller à l’étape ${STATUS[stage]} (${data?.counts?.[stage] ?? '—'})`} onClick={() => jump(stage)}>{STATUS[stage]} <span className="ml-1 tabular-nums text-muted-foreground">{data?.counts?.[stage] ?? '—'}</span></Button>)}</div>}
    <div className="relative min-w-0">
      <div ref={ref} data-board-region className="grid max-w-full grid-cols-[repeat(5,minmax(184px,1fr))] gap-2 overflow-auto overscroll-x-contain rounded-lg pb-2 lg:[@media(min-height:640px)]:h-[var(--board-fill)]" role="region" tabIndex={0} aria-label="Tableau des opportunités, défilement horizontal" onDragStart={e => setDragging(e.target.closest('[data-stage]')?.dataset.stage)} onDragEnd={() => setDragging(null)} onDrop={() => setDragging(null)}>
        {BOARD_STAGES.map(stage => <Column key={stage} dragging={dragging} stage={stage} args={args} initial={data?.pages?.[stage]} count={data?.counts?.[stage]} asOf={data?.as_of} onOpen={onOpen} onAction={onAction} />)}
      </div>
      <EdgeFades edges={edges} />
    </div>
  </div>;
}
export default function OpportunitiesBoard({ query, args, onOpen, onAction, filtered, onReset, regionRef, restore, filterKey }) {
  return <ReadState query={query} available={Number.isFinite(query.data?.total) && BOARD_STAGES.every(stage => Array.isArray(query.data?.pages?.[stage]?.rows))} filtered={filtered} onReset={onReset} empty={filtered ? "Aucun prospect correspondant à cette vue et ces filtres." : "Aucun prospect enregistré. Ajoutez un prospect pour commencer le suivi."}>{query.data?.total !== 0 ? <BoardRegion data={query.data} args={args} onOpen={onOpen} onAction={onAction} regionRef={regionRef} restore={restore} filterKey={filterKey} /> : null}</ReadState>;
}

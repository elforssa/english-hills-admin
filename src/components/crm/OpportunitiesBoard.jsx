'use client';
import { useState } from 'react';
import { useCrmRead } from '@/lib/crm/queries';
import { BOARD_STAGES, STATUS, opportunityAction } from '@/lib/crm/presentation.mjs';
import { Button } from '@/components/ui/button';
import { ReadState } from './CrmShared';
import OpportunityCard from './OpportunityCard';
function Column({ stage, initial, args, count, onOpen, onAction, dragging, asOf, staffRows }) {
  const [cursors, setCursors] = useState([null]);
  const cursor = cursors.at(-1);
  const query = useCrmRead('crm_get_opportunities', { ...args, p_stage: stage, p_cursor: cursor }, !!cursor);
  const page = cursor ? query.data?.pages?.[stage] : initial;
  return <section aria-label={STATUS[stage]} className={`w-[280px] shrink-0 rounded-lg bg-slate-100/70 p-2 ${dragging && ![null,'unsupported'].includes(opportunityAction(dragging,stage)) ? 'ring-2 ring-blue-300' : ''}`} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={e => {
    e.preventDefault();
    try { const lead = JSON.parse(e.dataTransfer.getData('application/eh-opportunity')); const action = opportunityAction(lead.status, stage); if (action) onAction(lead.id, action); } catch { /* Ignore foreign drag data. */ }
  }}><header className="flex items-center justify-between px-1 py-2 text-xs font-semibold text-slate-600"><h2 className="text-base leading-6 font-semibold">{STATUS[stage]}</h2><span>{query.data?.counts?.[stage] ?? count ?? '—'}</span></header>
    {cursor && <ReadState query={query} />}
    <div className="space-y-2">{page?.rows?.map(lead => <OpportunityCard key={lead.id} lead={lead} onOpen={onOpen} onAction={onAction} asOf={asOf} staffRows={staffRows} />)}</div>
    {page && !page.rows.length && <p className="px-1 py-8 text-center text-xs text-slate-500">Aucun prospect</p>}
    <div className="mt-2 flex gap-1">{cursors.length > 1 && <Button variant="ghost" className="min-h-9 text-xs" onClick={() => setCursors(x => x.slice(0, -1))}>Précédents</Button>}{page?.has_more && <Button variant="ghost" className="min-h-9 text-xs" onClick={() => setCursors(x => [...x, page.next_cursor])}>Voir les suivants</Button>}</div>
  </section>;
}
export default function OpportunitiesBoard({ query, args, onOpen, onAction, filtered, onReset, staffRows }) {
  const [dragging,setDragging] = useState(null);
  return <ReadState query={query} available={Number.isFinite(query.data?.total) && BOARD_STAGES.every(stage => Array.isArray(query.data?.pages?.[stage]?.rows))} filtered={filtered} onReset={onReset} empty={filtered ? "Aucun prospect correspondant à cette vue et ces filtres." : "Aucun prospect enregistré. Ajoutez un prospect pour commencer le suivi."}>{query.data?.total !== 0 ? <div className="flex max-w-full gap-3 overflow-x-auto pb-4" role="region" tabIndex={0} aria-label="Tableau des opportunités, défilement horizontal" onDragStart={e => setDragging(e.target.closest('[data-stage]')?.dataset.stage)} onDragEnd={() => setDragging(null)} onDrop={() => setDragging(null)}>{BOARD_STAGES.map(stage => <Column key={stage} dragging={dragging} stage={stage} args={args} initial={query.data?.pages?.[stage]} count={query.data?.counts?.[stage]} asOf={query.data?.as_of} staffRows={staffRows} onOpen={onOpen} onAction={onAction} />)}</div> : null}</ReadState>;
}

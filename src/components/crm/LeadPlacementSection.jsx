'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { dateLabel } from '@/lib/crm/presentation.mjs';
import { Pager, ReadState } from './CrmShared';

export default function LeadPlacementSection({ lead, onOpen }) {
  const [offset, setOffset] = useState(0);
  const query = useCrmRead('crm_list_placements', { p_lead: lead.id, p_limit: 5, p_offset: offset });
  return <section className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Test de niveau</h3>{lead.status === 'QUALIFIED' && !lead.next_placement && lead.next_task?.task_type !== 'confirm_placement_test' && <Button variant="outline" className="min-h-11" onClick={() => onOpen(null)}>{lead.placement_count ? 'Réserver un nouveau test' : 'Réserver un test'}</Button>}</div>
    <ReadState query={query} empty="Aucun test réservé.">{query.data?.rows?.length ? query.data.rows.map(test => <article key={test.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{dateLabel(test.scheduled_for)}</p><span className="text-slate-500">{test.status}</span></div>{test.examinateur && <p className="mt-1 text-slate-500">Examinateur : {test.examinateur}</p>}{test.niveau_recommande && <p className="mt-2 font-medium">Niveau recommandé : {test.niveau_recommande}</p>}{test.score != null && <p>Score : {test.score}</p>}<div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => onOpen(test)}>Voir</Button>{test.status === 'Planifié' && <Button size="sm" variant="outline" onClick={() => onOpen(test)}>Reprogrammer</Button>}</div></article>) : null}</ReadState>
    <Pager offset={offset} total={query.data?.total || 0} size={5} onChange={setOffset} />
  </section>;
}

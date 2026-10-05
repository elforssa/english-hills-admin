'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { CALL_TASKS, TASKS, UUID, dateLabel } from '@/lib/crm/presentation.mjs';
import { LifecycleBadge, ReadState } from './CrmShared';
import CrmIntakeReview from './CrmIntakeReview';

const buckets = { overdue: 'En retard', today: 'Aujourd’hui', tomorrow: 'Demain', upcoming: 'À venir' };
const control = 'min-h-11 min-w-0 max-w-full rounded-md border bg-white px-3 text-sm';
function ownerArgs(value, prefix) {
  return { [`p_${prefix}_mode`]: ['all','me','unassigned'].includes(value) ? value : 'staff', [`p_${prefix}`]: UUID.test(value) ? value : null };
}
export default function WorkQueue({ params, setFilter, onOpen, onAction }) {
  const bucket = params.get('bucket') || 'today', assignee = params.get('assignee') || 'me', owner = params.get('owner') || 'all';
  const [staffOffset, setStaffOffset] = useState(0), [pages, setPages] = useState({});
  const filterKey = JSON.stringify([assignee,owner]);
  const pageKey = `${filterKey}:${bucket}`;
  const cursors = pages[pageKey] || [null];
  const query = useCrmRead('crm_get_work_queue', { p_bucket:bucket, ...ownerArgs(assignee,'assignee'), ...ownerArgs(owner,'owner'), p_cursor:cursors.at(-1), p_limit:25 });
  const staff = useCrmRead('crm_list_staff', {p_limit:50,p_offset:staffOffset});
  const day = useRef(null);
  useEffect(() => {
    const nextDay = query.data?.boundaries?.d1;
    if (day.current && nextDay && day.current !== nextDay) setPages({});
    if (nextDay) day.current = nextDay;
  }, [query.data?.boundaries?.d1]);
  useEffect(() => { const reset=()=>setPages({}); window.addEventListener('crm:refresh',reset); return ()=>window.removeEventListener('crm:refresh',reset); }, []);
  function select(key,value) { setPages({}); setFilter(key,value); }
  function staffSelect(label,key,value) {
    return <label className="grid min-w-0 gap-1 text-xs text-slate-500">{label}<select aria-label={label} className={control} value={value} onChange={e=>select(key,e.target.value)}>
      <option value="me">{key==='assignee' ? 'Mes tâches' : 'Moi'}</option><option value="all">Toute l’équipe</option><option value="unassigned">Non attribué</option>
      {!['all','me','unassigned'].includes(value) && !staff.data?.rows.some(p=>p.id===value) && <option value={value}>Responsable sélectionné</option>}
      {staff.data?.rows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>;
  }
  return <section className="space-y-4 min-w-0">
    <div className="flex flex-wrap items-end gap-3">{staffSelect('Responsable de la tâche','assignee',assignee)}{staffSelect('Responsable du prospect','owner',owner)}
      <Link href="/crm/leads?view=attention&layout=list" className="ml-auto inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm text-blue-800 hover:bg-blue-50">À surveiller · prospects sans prochaine action</Link>
    </div>
    <p className="text-xs text-slate-500">Les deux filtres se combinent. Changer le responsable d’un prospect laisse ses tâches attribuées à leurs responsables actuels.</p>
    {staff.isError && <p role="alert" className="text-sm">Équipe indisponible. <Button variant="ghost" onClick={()=>staff.refetch()}>Réessayer</Button></p>}
    {(staffOffset>0 || staff.data?.total>50) && <div className="flex gap-2"><Button variant="ghost" disabled={!staffOffset} onClick={()=>setStaffOffset(x=>x-50)}>Équipe précédente</Button><Button variant="ghost" disabled={staffOffset+50>=staff.data?.total} onClick={()=>setStaffOffset(x=>x+50)}>Équipe suivante</Button></div>}
    <nav aria-label="Échéances des tâches" className="flex flex-wrap gap-1 border-b pb-2">{Object.entries(buckets).map(([key,label])=><Button key={key} variant={bucket===key ? 'default' : 'ghost'} className="min-h-11" aria-pressed={bucket===key} onClick={()=>setFilter('bucket',key)}>{label}<span data-testid={`work-count-${key}`} className="ml-2 rounded bg-slate-100 px-1.5 text-xs tabular-nums text-slate-700">{query.data?.counts?.[key] ?? '—'}</span></Button>)}</nav>
    <p className="text-xs text-slate-500">Heures de Casablanca · En retard inclut les tâches dues plus tôt aujourd’hui. Actualisation chaque minute.</p>
    <div className="overflow-hidden rounded-lg border bg-white"><ReadState query={query} empty="Aucune tâche dans cette échéance.">{query.data?.rows?.length ? query.data.rows.map(task=><article data-testid="work-row" data-task-id={task.id} key={task.id} className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2"><button className="min-h-11 min-w-0 text-left focus-visible:outline-blue-600" onClick={()=>onOpen(task.lead.id)}><span className="block break-words text-sm font-semibold text-slate-900">{task.lead.contact_name}</span><span className="block break-words text-xs text-slate-500">{task.lead.learner_name || 'Apprenant à préciser'}{task.lead.program ? ` · ${task.lead.program}` : ''}</span></button><LifecycleBadge status={task.lead.status}/></div>
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm"><p className="font-medium">{TASKS[task.task_type] || 'Action'}</p><p className={bucket==='overdue' ? 'text-red-700' : 'text-slate-600'}>{dateLabel(task.due_at)}</p></div>
      <p className="mt-1 text-xs text-slate-500">Tâche : {task.assignee_name || 'Non attribuée'} · Prospect : {task.lead.owner_name || 'Non attribué'}{task.attempt_ordinal ? ` · Prochain appel : ${task.attempt_ordinal} sur 5` : ''}</p>
      <div className="mt-2 flex flex-wrap gap-1"><Button size="sm" variant="outline" className="min-h-11" onClick={()=>onAction(task.lead.id,CALL_TASKS.includes(task.task_type) ? 'call' : 'complete',task)}>{CALL_TASKS.includes(task.task_type) ? 'Résultat d’appel' : 'Terminer l’action'}</Button><Button size="sm" variant="ghost" className="min-h-11" onClick={()=>onAction(task.lead.id,'reschedule',task)}>Replanifier</Button><Button size="sm" variant="ghost" className="min-h-11" onClick={()=>onAction(task.lead.id,'reassign',task)}>Réattribuer</Button><Button size="sm" variant="ghost" className="min-h-11" onClick={()=>onOpen(task.lead.id)}>Voir le prospect</Button></div>
    </article>) : null}</ReadState></div>
    <div className="flex gap-2"><Button variant="outline" disabled={cursors.length===1} onClick={()=>setPages(x=>({...x,[pageKey]:cursors.slice(0,-1)}))}>Précédentes</Button><Button variant="outline" disabled={!query.data?.has_more || query.isFetching} onClick={()=>setPages(x=>({...x,[pageKey]:[...cursors,query.data.next_cursor]}))}>Suivantes</Button></div>
    <CrmIntakeReview/>
  </section>;
}

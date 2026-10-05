'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import FilterBar from '@/components/operational/FilterBar';
import FormField from '@/components/operational/FormField';
import CursorPager from '@/components/operational/CursorPager';
import { programmeLabel } from '@/lib/ui/presentation.mjs';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { CALL_TASKS, TASKS, UUID, scheduledLabel, staffLabel } from '@/lib/crm/presentation.mjs';
import { LifecycleBadge, ReadState } from './CrmShared';
import CrmIntakeReview from './CrmIntakeReview';

const buckets = { overdue: 'En retard', today: 'Aujourd’hui', tomorrow: 'Demain', upcoming: 'À venir' };
const control = 'operational-control';
function ownerArgs(value, prefix) {
  return { [`p_${prefix}_mode`]: ['all','me','unassigned'].includes(value) ? value : 'staff', [`p_${prefix}`]: UUID.test(value) ? value : null };
}
export default function WorkQueue({ params, setFilter, onOpen, onAction, onReset }) {
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
    return <div className="min-w-0 flex-1 basis-32"><FormField label={label}><select disabled={staff.isPending || staff.isError || !Array.isArray(staff.data?.rows)} aria-label={label} className={control} value={value} onChange={e=>select(key,e.target.value)}>
      <option value="me">{key==='assignee' ? 'Mes tâches' : 'Moi'}</option><option value="all">Toute l’équipe</option><option value="unassigned">Non attribué</option>
      {!['all','me','unassigned'].includes(value) && !staff.data?.rows?.some(p=>p.id===value) && <option value={value}>Responsable sélectionné</option>}
      {staff.data?.rows?.map(p=><option key={p.id} value={p.id}>{staffLabel(p)}</option>)}
    </select></FormField></div>;
  }
  return <section className="space-y-4 min-w-0">
    <FilterBar activeCount={Number(assignee!=='me') + Number(owner!=='all')} summary={`Tâches · ${buckets[bucket]} · ${assignee === 'me' ? 'Mes tâches' : 'Équipe filtrée'}`} onReset={() => { setPages({}); onReset(); }}>{staffSelect('Responsable de la tâche','assignee',assignee)}{staffSelect('Responsable du prospect','owner',owner)}
      <Link data-touch-target href="/crm/leads?view=attention&layout=list" className="ml-auto inline-flex min-h-9 items-center rounded-md border bg-white px-3 text-sm text-blue-800 hover:bg-blue-50">À traiter · prospects nécessitant un suivi</Link>
    </FilterBar>
    <p className="text-xs text-slate-500">Les deux filtres se combinent. Changer le responsable d’un prospect laisse ses tâches attribuées à leurs responsables actuels.</p>
    {(staff.isError || (!staff.isPending && !Array.isArray(staff.data?.rows))) && <p role={staff.isError ? "alert" : "status"} className="text-sm">Équipe indisponible. <Button variant="ghost" onClick={()=>staff.refetch()}>Réessayer</Button></p>}
    {(staffOffset>0 || staff.data?.total>50) && <div className="flex gap-2"><Button variant="ghost" disabled={!staffOffset} onClick={()=>setStaffOffset(x=>x-50)}>Équipe précédente</Button><Button variant="ghost" disabled={staffOffset+50>=staff.data?.total} onClick={()=>setStaffOffset(x=>x+50)}>Équipe suivante</Button></div>}
    <nav aria-label="Échéances des tâches" className="flex flex-wrap gap-1 border-b pb-2">{Object.entries(buckets).map(([key,label])=><Button key={key} variant={bucket===key ? 'default' : 'ghost'} className="min-h-9" aria-pressed={bucket===key} onClick={()=>setFilter('bucket',key)}>{label}<span data-testid={`work-count-${key}`} className="ml-2 rounded bg-slate-100 px-1.5 text-xs tabular-nums text-slate-700">{query.data?.counts?.[key] ?? '—'}</span></Button>)}</nav>
    <p className="text-xs text-slate-500">Heures de Casablanca · En retard inclut les tâches dues plus tôt aujourd’hui. Actualisation chaque minute.</p>
    <div className="overflow-hidden rounded-lg border bg-white"><ReadState query={query} available={Array.isArray(query.data?.rows)} filtered={assignee !== 'all' || owner !== 'all'} onReset={() => { setPages({}); onReset(); }} empty="Aucune tâche dans cette échéance et ce périmètre. Choisissez une autre échéance ou ajustez les filtres.">{Array.isArray(query.data?.rows) && query.data.rows.length ? query.data.rows.map(task=><article data-testid="work-row" data-task-id={task.id} key={task.id} className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold">{TASKS[task.task_type] || 'Action'}</p><p className={`text-xs tabular-nums ${bucket==='overdue' ? 'text-red-800' : 'text-muted-foreground'}`}>{bucket==='overdue' ? 'En retard · ' : ''}{scheduledLabel(task)}</p></div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><button className="min-w-0 text-left" onClick={()=>onOpen(task.lead.id)}><span className="block break-words text-sm font-medium">{task.lead.contact_name}</span><span className="block break-words operational-secondary">{task.lead.learner_name || 'Apprenant à préciser'} · {programmeLabel(task.lead.program)}</span></button><LifecycleBadge status={task.lead.status}/></div>
      <p className="mt-1 text-xs text-slate-500">Responsable de la tâche : {task.assigned_to ? staffLabel(staff.data?.rows.find(p=>p.id===task.assigned_to)) : 'Non attribuée'} · Responsable du prospect : {task.lead.owner_id ? staffLabel(staff.data?.rows.find(p=>p.id===task.lead.owner_id)) : 'Non attribué'}{task.attempt_ordinal ? ` · Prochain appel : ${task.attempt_ordinal} sur 5` : ''}</p>
      <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={()=>onAction(task.lead.id,CALL_TASKS.includes(task.task_type) ? 'call' : 'complete',task)}>{CALL_TASKS.includes(task.task_type) ? 'Résultat d’appel' : 'Terminer l’action'}</Button><Button size="sm" variant="ghost" className="min-h-9" onClick={()=>onAction(task.lead.id,'reschedule',task)}>Replanifier</Button><Button size="sm" variant="ghost" className="min-h-9" onClick={()=>onAction(task.lead.id,'reassign',task)}>Réattribuer</Button><Button size="sm" variant="ghost" className="min-h-9" onClick={()=>onOpen(task.lead.id)}>Voir le prospect</Button></div>
    </article>) : null}</ReadState></div>
    <CursorPager hasPrevious={cursors.length>1} hasMore={query.data?.has_more} pending={query.isFetching} onPrevious={()=>setPages(x=>({...x,[pageKey]:cursors.slice(0,-1)}))} onNext={()=>setPages(x=>({...x,[pageKey]:[...cursors,query.data.next_cursor]}))}/>
    <CrmIntakeReview/>
  </section>;
}

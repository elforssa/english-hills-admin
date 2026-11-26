'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import FilterBar from '@/components/operational/FilterBar';
import FormField from '@/components/operational/FormField';
import CursorPager from '@/components/operational/CursorPager';
import { programmeLabel } from '@/lib/ui/presentation.mjs';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { CALL_TASKS, SCHEDULE_KINDS, UUID, WORK_BUCKETS, actionErrorMessage, scheduledLabel, staffLabel } from '@/lib/crm/presentation.mjs';
import { pluralFr } from '@/lib/ui/pluralFr.mjs';
import AppointmentOutcome from './AppointmentOutcome';
import { LifecycleBadge, ReadState } from './CrmShared';
import CrmIntakeReview from './CrmIntakeReview';
import { useCrmCommand } from './useCrmCommand';

const buckets = WORK_BUCKETS;
const MODES = ['all', 'me', 'unassigned', 'me_or_unassigned'];
const control = 'operational-control';
function ownerArgs(value, prefix) {
  // « Moi + non attribué » is the assignee default (§4.6); the owner filter has no such mode.
  const mode = prefix === 'owner' && value === 'me_or_unassigned' ? 'all' : MODES.includes(value) ? value : 'staff';
  return { [`p_${prefix}_mode`]: mode, [`p_${prefix}`]: UUID.test(value) ? value : null };
}
// « Pas de réponse » in one tap from the Tâches row (RWR-r5 §4.9, OD-20; day script « appel sans
// réponse »: 1 action). Inside the 3-hour gap the server refuses; the exchange form then opens
// with the result kept, showing the gap and « Tentative réelle (hors délai) » (invariant 15).
function RowNoAnswer({ lead, action, onGap }) {
  const tap = useCrmCommand();
  const gap = tap.error?.hint === 'crm_exchange.attempt_gap';
  useEffect(() => { if (gap) { tap.clearError(); onGap(); } }, [gap]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run() {
    const saved = await tap.run('crm_log_exchange', () => ({ lead_id: lead.id, expected_version: lead.version, channel: 'phone', result: 'no_answer' }), [lead.id, action.id, 'no_answer']);
    if (saved) toast.success('Pas de réponse enregistré');
  }
  return <><Button size="sm" variant="outline" className="min-h-9" disabled={tap.busy} onClick={run}>{tap.busy ? 'Enregistrement…' : 'Pas de réponse'}</Button>
    {tap.error && !gap && <p role="alert" className="basis-full text-xs text-red-800">{actionErrorMessage(tap.error)}</p>}</>;
}

// Agreed times booked before the centre hours changed are kept, never moved (§4.5):
// they are listed here so the receptionist can call the contact and « Changer » them.
// Hidden when there are none.
function OutsideHours({ onOpen, onAction }) {
  const [offset, setOffset] = useState(0);
  const query = useCrmRead('crm_list_outside_hours', { p_limit: 20, p_offset: offset });
  const total = query.data?.total || 0;
  if (!Array.isArray(query.data?.rows) || !total) return null;
  return <section aria-label="Hors des nouveaux horaires" data-testid="outside-hours" className="rounded-lg border border-amber-200 bg-amber-50 p-3">
    <h3 className="text-sm font-semibold text-amber-900">Hors des nouveaux horaires ({total})</h3>
    <p className="text-xs text-amber-900">Fixés avant le changement d’horaires : l’heure est gardée. Appelez le contact et changez l’heure si besoin.</p>
    <ul className="mt-2 divide-y divide-amber-100">{query.data.rows.map(row => <li key={row.action.id} data-testid="outside-hours-row" data-lead-id={row.lead_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
      <button type="button" className="min-w-0 text-left" onClick={() => onOpen(row.lead_id)}><span className="block break-words text-sm font-medium">{row.contact_name}</span><span className="block text-xs text-slate-700">{row.action.label} · {scheduledLabel(row.action)}</span></button>
      <Button size="sm" variant="outline" className="min-h-9" onClick={() => onAction(row.lead_id, 'change')}>Changer</Button>
    </li>)}</ul>
    {total > 20 && <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" disabled={!offset} onClick={() => setOffset(x => Math.max(0, x - 20))}>Précédents</Button><Button size="sm" variant="ghost" disabled={offset + 20 >= total} onClick={() => setOffset(x => x + 20)}>Suivants</Button></div>}
  </section>;
}

export default function WorkQueue({ params, setFilter, onOpen, onAction, onReset }) {
  const bucket = WORK_BUCKETS[params.get('bucket')] ? params.get('bucket') : 'today', assignee = params.get('assignee') || 'me_or_unassigned', owner = params.get('owner') || 'all';
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
      {key==='assignee' && <option value="me_or_unassigned">Moi + non attribué</option>}<option value="me">{key==='assignee' ? 'Mes tâches' : 'Moi'}</option><option value="all">Toute l’équipe</option><option value="unassigned">Non attribué</option>
      {!MODES.includes(value) && !staff.data?.rows?.some(p=>p.id===value) && <option value={value}>Responsable sélectionné</option>}
      {staff.data?.rows?.map(p=><option key={p.id} value={p.id}>{staffLabel(p)}</option>)}
    </select></FormField></div>;
  }
  return <section className="space-y-4 min-w-0">
    <FilterBar activeCount={Number(assignee!=='me_or_unassigned') + Number(owner!=='all')} summary={`Tâches · ${buckets[bucket]} · ${assignee === 'me_or_unassigned' ? 'Moi + non attribué' : assignee === 'me' ? 'Mes tâches' : 'Équipe filtrée'}`} onReset={() => { setPages({}); onReset(); }}>{staffSelect('Responsable de la tâche','assignee',assignee)}{staffSelect('Responsable du prospect','owner',owner)}
      <Link data-touch-target href="/crm/leads?view=attention&layout=list" className="ml-auto inline-flex min-h-9 items-center rounded-md border bg-white px-3 text-sm text-blue-800 hover:bg-blue-50">À traiter · prospects nécessitant un suivi</Link>
    </FilterBar>
    <p className="text-xs text-slate-500">Une ligne par contact : sa prochaine action (plusieurs apprenants du même contact sont regroupés). Les deux filtres se combinent.</p>
    <OutsideHours onOpen={onOpen} onAction={onAction} />
    {(staff.isError || (!staff.isPending && !Array.isArray(staff.data?.rows))) && <p role={staff.isError ? "alert" : "status"} className="text-sm">Équipe indisponible. <Button variant="ghost" onClick={()=>staff.refetch()}>Réessayer</Button></p>}
    {(staffOffset>0 || staff.data?.total>50) && <div className="flex gap-2"><Button variant="ghost" disabled={!staffOffset} onClick={()=>setStaffOffset(x=>x-50)}>Équipe précédente</Button><Button variant="ghost" disabled={staffOffset+50>=staff.data?.total} onClick={()=>setStaffOffset(x=>x+50)}>Équipe suivante</Button></div>}
    <nav aria-label="Échéances des tâches" className="flex flex-wrap gap-1 border-b pb-2">{Object.entries(buckets).map(([key,label])=><Button key={key} variant={bucket===key ? 'default' : 'ghost'} className="min-h-9" aria-pressed={bucket===key} onClick={()=>setFilter('bucket',key)}>{label}<span data-testid={`work-count-${key}`} className="ml-2 rounded bg-slate-100 px-1.5 text-xs tabular-nums text-slate-700">{query.data?.counts?.[key] ?? '—'}</span></Button>)}</nav>
    <p className="text-xs text-slate-500">Heures de Casablanca · En retard inclut les actions dues plus tôt aujourd’hui ; « En attente » n’est jamais en retard. Actualisation chaque minute.</p>
    <div className="overflow-hidden rounded-lg border bg-white"><ReadState query={query} available={Array.isArray(query.data?.rows)} filtered={assignee !== 'all' || owner !== 'all'} onReset={() => { setPages({}); onReset(); }} empty="Aucun prospect dans cette échéance et ce périmètre. Choisissez une autre échéance ou ajustez les filtres.">{Array.isArray(query.data?.rows) && query.data.rows.length ? query.data.rows.map(row=>{ const action=row.next_action || row; return <article data-testid="work-row" data-task-id={row.id} data-lead-id={row.lead_id} key={row.id} className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold">{action.label}{SCHEDULE_KINDS[row.schedule_kind] && <span className="ml-2 text-xs font-medium text-blue-900">{SCHEDULE_KINDS[row.schedule_kind]}</span>}</p><p className="flex flex-wrap gap-1 text-xs">{action.overdue && <span className="rounded bg-red-50 px-1.5 font-medium text-red-800">En retard</span>}{action.relance_due && <span className="rounded bg-amber-50 px-1.5 font-medium text-amber-900">À relancer</span>}{row.review_flag === 'd1_review' && <span className="rounded bg-slate-100 px-1.5 text-slate-700">À vérifier</span>}</p></div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><button className="min-w-0 text-left" onClick={()=>onOpen(row.lead.id)}><span className="block break-words text-sm font-medium">{row.lead.contact_name}{row.siblings > 1 && <span className="ml-2 text-xs font-normal text-slate-600">{pluralFr(row.siblings, 'apprenant')}</span>}</span><span className="block break-words operational-secondary">{row.lead.learner_name || 'Apprenant à préciser'} · {programmeLabel(row.lead.program)}</span>{row.family?.length > 0 && <span data-testid="work-row-family" className="block break-words text-xs text-slate-600">Aussi : {row.family.map(f => `${f.learner_name || 'Apprenant à préciser'}${f.next_action?.label ? ` (${f.next_action.label})` : ''}`).join(', ')}</span>}</button><LifecycleBadge status={row.lead.status}/></div>
      <p className="mt-1 text-xs text-slate-500">Responsable de la tâche : {row.assigned_to ? row.assignee_display_label || 'Responsable indisponible' : 'Non attribuée'} · Responsable du prospect : {row.lead.owner_id ? row.lead.owner_display_label || 'Responsable indisponible' : 'Non attribué'}{row.lead.failed_attempts > 0 ? ` · ${pluralFr(row.lead.failed_attempts, 'appel infructueux', 'appels infructueux')}` : ''}</p>
      <div className="mt-2 flex flex-wrap gap-2">{CALL_TASKS.includes(action.task_type) && <RowNoAnswer lead={row.lead} action={action} onGap={()=>onAction(row.lead.id,'no_answer')} />}<Button size="sm" onClick={()=>onAction(row.lead.id,'exchange')}>Noter un échange</Button><Button size="sm" variant="ghost" className="min-h-9" onClick={()=>onAction(row.lead.id,'change')}>Changer</Button><Button size="sm" variant="ghost" className="min-h-9" onClick={()=>onOpen(row.lead.id)}>Voir le prospect</Button><DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="min-h-9 px-2" aria-label={`Plus d’options · ${row.lead.contact_name}`}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>onAction(row.lead.id,'reassign',row)}>Réattribuer l’action</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      {action.task_type === 'center_visit' && <div className="mt-2"><AppointmentOutcome compact leadId={row.lead.id} version={row.lead.version} action={action} /></div>}
    </article>; }) : null}</ReadState></div>
    <CursorPager hasPrevious={cursors.length>1} hasMore={query.data?.has_more} pending={query.isFetching} onPrevious={()=>setPages(x=>({...x,[pageKey]:cursors.slice(0,-1)}))} onNext={()=>setPages(x=>({...x,[pageKey]:[...cursors,query.data.next_cursor]}))}/>
    <CrmIntakeReview/>
  </section>;
}

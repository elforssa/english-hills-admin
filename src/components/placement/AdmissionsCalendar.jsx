'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCrmRead, useCrmRefresh } from '@/lib/crm/queries';
import { UUID } from '@/lib/crm/presentation.mjs';
import { agendaDateLabel, calendarDate, casablancaToday, shiftCalendarDate } from '@/lib/crm/calendar.mjs';
import { LifecycleBadge, ReadState } from '@/components/crm/CrmShared';
import LeadDetailSheet from '@/components/crm/LeadDetailSheet';
import LegacyPlacementEditor from './LegacyPlacementEditor';

export default function AdmissionsCalendar() {
  const router=useRouter(), pathname=usePathname(), params=useSearchParams(), refresh=useCrmRefresh();
  const [today]=useState(casablancaToday), [cursors,setCursors]=useState([null]);
  const [editing,setEditing]=useState(null);
  const heading=useRef(null), origin=useRef(null);
  const start=calendarDate(params.get('date')) || today, days=params.get('span')==='day' ? 1 : 7;
  const kind=params.get('kind') || 'all', completed=params.get('completed')==='1';
  const selected=UUID.test(params.get('lead') || '') ? params.get('lead') : null;
  const filterKey=JSON.stringify([start,days,kind,completed]);
  const cursorFilter=useRef(filterKey);
  useEffect(()=>{cursorFilter.current=filterKey;setCursors([null]);},[filterKey]);
  useEffect(()=>{const reset=()=>setCursors([null]);window.addEventListener('crm:refresh',reset);return()=>window.removeEventListener('crm:refresh',reset);},[]);
  const query=useCrmRead('crm_get_admissions_calendar',{p_start:start,p_end:shiftCalendarDate(start,days),p_kind:kind,p_include_completed:completed,p_cursor:cursorFilter.current===filterKey ? cursors.at(-1) : null,p_limit:100});
  function change(key,value,push=false) {
    const next=new URLSearchParams(params.toString());
    if(value)next.set(key,value);else next.delete(key);
    if(key==='lead'&&value)origin.current=document.activeElement;
    if(key!=='lead')setCursors([null]);
    router[push?'push':'replace'](`${pathname}?${next}`,{scroll:false});
  }
  const rows=query.data?.rows || [], dates=[...new Set(rows.map(row=>row.local_date))];
  return <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-5 sm:px-6">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">Admissions · English Hills</p><h1 ref={heading} tabIndex={-1} className="text-xl font-semibold tracking-tight">Calendrier admissions</h1><p className="mt-2 text-sm text-slate-500">Tests de niveau et visites au centre · Heures de Casablanca</p></div><Link className="inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm" href="/placement-tests">Tests de niveau</Link></header>
    <div className="mb-4 flex flex-wrap items-center gap-2"><Button variant="outline" aria-label="Période précédente" onClick={()=>change('date',shiftCalendarDate(start,-days))}>←</Button><input aria-label="Date de début" type="date" className="min-h-11 min-w-0 rounded-md border px-3 text-sm" value={start} onChange={e=>{if(calendarDate(e.target.value))change('date',e.target.value);}}/><Button variant="outline" aria-label="Période suivante" onClick={()=>change('date',shiftCalendarDate(start,days))}>→</Button><Button variant="ghost" onClick={()=>change('date',casablancaToday())}>Aujourd’hui</Button>
      <select aria-label="Période" className="min-h-11 rounded-md border px-3 text-sm" value={days===1?'day':'week'} onChange={e=>change('span',e.target.value)}><option value="day">Jour</option><option value="week">Semaine</option></select>
      <select aria-label="Rendez-vous" className="min-h-11 max-w-full rounded-md border px-3 text-sm" value={kind} onChange={e=>change('kind',e.target.value)}><option value="all">Tests et visites</option><option value="placement">Tests de niveau</option><option value="center_visit">Visites au centre</option></select>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={completed} onChange={e=>change('completed',e.target.checked?'1':'')}/>Inclure les tests terminés</label>
    </div>
    <p className="mb-3 text-xs text-slate-500">{agendaDateLabel(start)}{days>1 ? ` — ${agendaDateLabel(shiftCalendarDate(start,days-1))}` : ''} · Tests affichés à leur heure de début, sans durée présumée.</p>
    <div className="rounded-lg border bg-white"><ReadState query={query} empty="Aucun rendez-vous dans cette période.">{rows.length ? dates.map(date=><section key={date} className="border-b last:border-0"><h2 className="border-b bg-slate-50 px-4 py-3 text-sm font-semibold capitalize">{agendaDateLabel(date)}</h2>{[false,true].map(unspecified=>{
      const lane=rows.filter(row=>row.local_date===date&&(!row.local_time)===unspecified);
      if(!lane.length)return null;
      return <div key={String(unspecified)}>{unspecified&&<h3 className="px-4 pt-3 text-xs font-semibold text-slate-500">Heure non précisée</h3>}{lane.map(event=><button key={`${event.kind}:${event.id}`} data-testid="calendar-event" data-event-key={`${event.kind}:${event.id}`} className="flex w-full min-w-0 flex-wrap items-start gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50 focus-visible:outline-blue-600" onClick={()=>event.lead_id ? change('lead',event.lead_id,true) : setEditing(event.id)}>
        <span className="w-24 shrink-0 text-sm font-medium tabular-nums text-blue-800">{event.local_time ? event.local_time.slice(0,5) : 'À préciser'}{event.ends_at&&<span className="block text-xs text-slate-500">jusqu’à {new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Casablanca',hour:'2-digit',minute:'2-digit'}).format(new Date(event.ends_at))}</span>}</span>
        <span className="min-w-0 flex-1 basis-44"><span className="block break-words text-sm font-semibold">{event.display_name || 'Apprenant à préciser'}</span><span className="block text-xs text-slate-500">{event.kind==='placement' ? 'Test de niveau' : 'Visite au centre'}{event.placement_status ? ` · ${event.placement_status}` : ''}</span>{event.examiner_label&&<span className="block break-words text-xs text-slate-500">Examinateur indiqué : {event.examiner_label}</span>}{event.kind==='center_visit'&&<span className="block text-xs text-slate-500">Responsable de la tâche : {event.assignee_name || 'Non attribué'}</span>}</span>{event.stage&&<LifecycleBadge status={event.stage}/>}
      </button>)}</div>;
    })}</section>) : null}</ReadState></div>
    <div className="mt-4 flex flex-wrap items-center gap-2"><Button variant="outline" disabled={cursors.length===1} onClick={()=>setCursors(x=>x.slice(0,-1))}>Précédents</Button><Button variant="outline" disabled={!query.data?.has_more||query.isFetching} onClick={()=>setCursors(x=>[...x,query.data.next_cursor])}>Suivants</Button>{query.data?.has_more&&<p role="status" className="text-sm text-slate-600">D’autres rendez-vous restent à charger. Cette page ne couvre pas toute la période.</p>}</div>
    <p className="mt-5 text-xs text-slate-500">Le nom d’examinateur est un libellé ; aucune disponibilité n’est vérifiée. L’annulation d’un test de niveau n’est pas prise en charge en v1. Replanifiez ou renseignez son résultat depuis sa fiche.</p>
    {selected&&<LeadDetailSheet key={selected} leadId={selected} onClose={()=>change('lead','',true)} onRestoreFocus={()=>{(origin.current?.isConnected ? origin.current : heading.current)?.focus();}}/>}
    {editing&&<LegacyPlacementEditor key={editing} id={editing} onClose={()=>setEditing(null)} onSave={async()=>{setEditing(null);await refresh();}}/>}
  </div>;
}

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Plus, Search, Phone, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCrmRead } from '@/lib/crm/queries';
import { ACTIVE, STATUS, TASKS, UUID, dateLabel, phoneLinks } from '@/lib/crm/presentation.mjs';
import { LifecycleBadge, Pager, ReadState } from './CrmShared';
import LeadDetailSheet from './LeadDetailSheet';
import CrmActionDialog from './CrmActionDialog';
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
  {queue && <p className={`mt-1.5 text-sm font-semibold ${lead.priority === 1 ? 'text-red-700' : 'text-blue-800'}`}>{!lead.next_task && lead.failed_attempts >= 5 ? '5 appels infructueux effectués' : lead.priority === 3 && lead.next_task?.task_type === 'callback' ? 'Rappel' : priorities[lead.priority]}{lead.stale && lead.priority !== 5 ? ' · Contact à relancer' : ''}</p>}
  <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm"><p className="font-medium text-slate-700">{lead.next_task ? `${TASKS[lead.next_task.task_type] || 'Action'} · ${dateLabel(lead.next_task.due_at)}` : ACTIVE.includes(lead.status) ? lead.failed_attempts >= 5 ? 'Prévoir un appel ou clôturer le suivi' : 'Choisir une prochaine action' : 'Suivi clos'}</p>{lead.last_activity && <p className="text-xs text-slate-400">Mis à jour · {dateLabel(lead.last_activity.occurred_at)}</p>}</div>
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
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [offset, setOffset] = useState(0),
    [scheduleOffset, setScheduleOffset] = useState(0),
    [manual, setManual] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const reset = () => { setOffset(0); setScheduleOffset(0); };
    window.addEventListener('crm:refresh', reset);
    return () => window.removeEventListener('crm:refresh', reset);
  }, []);
  const today = useCrmRead('crm_get_today', {
    p_limit: 25,
    p_offset: offset,
    p_schedule_offset: scheduleOffset
  }, mode === 'today');
  const leads = useCrmRead('crm_search_leads', {
    p_query: query,
    p_status: status || null,
    p_contact: contact,
    p_limit: 25,
    p_offset: offset
  }, mode === 'leads');
  function selectLead(id) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('lead', id);else next.delete('lead');
    router.push(`${pathname}${next.size ? '?' + next : ''}`, {
      scroll: false
    });
  }
  const counts = today.data?.counts;
  return <div className="mx-auto max-w-7xl px-4 py-7 sm:px-8 sm:py-10">
  <header className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">Accueil · English Hills</p><h1 className="text-3xl font-semibold tracking-tight text-slate-900">{mode === 'today' ? 'Aujourd’hui' : 'Prospects'}</h1><p className="mt-2 text-sm text-slate-500">{mode === 'today' ? 'Les personnes à rappeler. Les prochaines étapes à préparer.' : 'Retrouvez un parent et reprenez la conversation.'}</p></div><Button onClick={() => setManual(true)}><Plus size={16} className="mr-2" />Ajouter un prospect</Button></header>
  {mode === 'today' ? <>
   <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['new', 'Nouveaux prospects'], ['overdue', 'Actions en retard'], ['callbacks', 'Rappels du jour'], ['due_today', 'Actions du jour']].map(([key, label]) => <div key={key} className="rounded-xl border bg-white px-5 py-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-3xl font-semibold tabular-nums ${key === 'overdue' && counts?.[key] ? 'text-red-700' : 'text-slate-900'}`}>{counts?.[key] ?? '—'}</p></div>)}</div>
   <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]"><section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">À traiter en priorité</h2><span className="text-xs text-slate-500">{today.data?.attention_total ?? '—'} prospects</span></div><div className="overflow-hidden rounded-xl border bg-white"><ReadState query={today} empty="Rien ne demande votre attention pour le moment.">{today.data?.needs_attention?.length ? today.data.needs_attention.map(lead => <LeadRow key={lead.id} lead={lead} onOpen={selectLead} queue />) : null}</ReadState><Pager offset={offset} total={today.data?.attention_total || 0} size={25} onChange={setOffset} /></div></section>
   <section><h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><CalendarDays size={18} />Agenda du jour</h2><div className="rounded-xl border bg-white"><ReadState query={today} empty="Aucune action prévue aujourd’hui.">{today.data?.today_schedule?.length ? today.data.today_schedule.map(task => <button key={task.id} onClick={() => selectLead(task.lead.id)} className="block w-full border-b p-4 text-left last:border-0 hover:bg-slate-50"><span className="text-xs font-semibold text-blue-800">{dateLabel(task.due_at)}</span><span className="mt-1 block font-medium">{task.lead.contact_name}</span><span className="text-sm text-slate-500">{TASKS[task.task_type] || 'Action'}</span></button>) : null}</ReadState><Pager offset={scheduleOffset} total={today.data?.schedule_total || 0} size={25} onChange={setScheduleOffset} /></div><p className="mt-3 text-xs text-slate-400">Heures de Casablanca · Les actions du jour incluent les rappels</p></section></div>
  </> : <section><div className="mb-5 flex flex-wrap gap-3"><label className="relative min-w-0 flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-400" /><span className="sr-only">Rechercher un prospect</span><input maxLength={120} className="h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm" placeholder="Nom du parent, apprenant ou téléphone…" value={search} onChange={e => setSearch(e.target.value)} /></label><label><span className="sr-only">Statut</span><select aria-label="Statut" className="h-11 rounded-lg border bg-white px-3 text-sm" value={status} onChange={e => {
            setStatus(e.target.value);
            setOffset(0);
          }}><option value="">Tous les statuts</option>{Object.entries(STATUS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label></div>{contact && <p className="mb-4 text-sm">Prospects du contact sélectionné. <Button variant="link" onClick={() => router.push('/crm/leads')}>Voir tous les prospects</Button></p>}<div className="rounded-xl border bg-white"><ReadState query={leads} empty={query || status ? 'Aucun prospect correspondant.' : 'Aucun prospect pour le moment.'}>{leads.data?.rows?.length ? leads.data.rows.map(lead => <LeadRow key={lead.id} lead={lead} onOpen={selectLead} />) : null}</ReadState><Pager offset={offset} total={leads.data?.total || 0} size={25} onChange={setOffset} /></div></section>}
  {selected && <LeadDetailSheet key={selected} leadId={selected} onClose={() => selectLead(null)} />}
  {manual && <CrmActionDialog action="manual" onClose={() => setManual(false)} onCreated={id => {
      setManual(false);
      selectLead(id);
    }} onCandidate={id => {
      setManual(false);
      router.push(`/crm/leads?contact=${id}`);
    }} />}
 </div>;
}

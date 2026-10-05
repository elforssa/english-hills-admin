'use client';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { ACTIVE, BOARD_STAGES, STATUS, TASKS, LOST, NOT_QUALIFIED, dateLabel, opportunityAction } from '@/lib/crm/presentation.mjs';
export function OpportunityActions({ lead, onAction }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="min-h-11 shrink-0 px-2" aria-label={`Actions · ${lead.learner_name || lead.contact_name}`}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    {BOARD_STAGES.filter(stage => ![null, 'unsupported'].includes(opportunityAction(lead.status, stage))).map(stage => <DropdownMenuItem key={stage} onSelect={() => onAction(lead.id, opportunityAction(lead.status, stage))}>{stage === 'CONVERTED' ? 'Ouvrir l’inscription' : `Avancer · ${STATUS[stage]}`}</DropdownMenuItem>)}
    {ACTIVE.includes(lead.status) && <><DropdownMenuItem onSelect={() => onAction(lead.id, 'lost')}>Clôturer comme perdu</DropdownMenuItem><DropdownMenuItem onSelect={() => onAction(lead.id, 'notQualified')}>Clôturer comme non qualifié</DropdownMenuItem></>}
    {['LOST', 'NOT_QUALIFIED'].includes(lead.status) && <DropdownMenuItem onSelect={() => onAction(lead.id, 'reopen')}>Rouvrir</DropdownMenuItem>}
    <DropdownMenuItem onSelect={() => onAction(lead.id, 'reassign')}>Attribuer un responsable</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;
}
export default function OpportunityCard({ lead, onOpen, onAction }) {
  const active = ACTIVE.includes(lead.status);
  return <article data-testid="opportunity-card" data-lead-id={lead.id} data-stage={lead.status} draggable={active} onDragStart={e => { e.dataTransfer.setData('application/eh-opportunity', JSON.stringify({ id: lead.id, status: lead.status })); e.dataTransfer.effectAllowed = 'move'; }} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
    <div className="flex items-start justify-between gap-1"><button onClick={() => onOpen(lead.id)} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-blue-600"><span className="block break-words font-semibold text-slate-900">{lead.contact_name}</span><span className="mt-1 block break-words text-xs text-slate-600">{lead.learner_name || 'Apprenant à préciser'}{lead.learner_age != null ? ` · ${lead.learner_age} ans` : ''}</span></button><OpportunityActions lead={lead} onAction={onAction} /></div>
    <p className="mt-2 break-words text-xs text-slate-500">{lead.program || 'Programme à préciser'} · {lead.source_label || 'Origine à préciser'}</p>
    <p className={`mt-3 text-xs ${lead.next_task && new Date(lead.next_task.due_at) < new Date() ? 'text-red-700' : 'text-slate-700'}`}>{lead.next_task ? `${TASKS[lead.next_task.task_type]} · ${dateLabel(lead.next_task.due_at)}` : lead.next_placement ? `Test de niveau · ${dateLabel(lead.next_placement.scheduled_for)}` : active ? 'Prochaine action à choisir' : 'Suivi clos'}</p>
    {lead.next_task?.attempt_ordinal && <p className="mt-1 text-xs">Prochaine tentative : {lead.next_task.attempt_ordinal} sur 5</p>}
    {lead.failed_attempts > 0 && <p className="mt-1 text-xs text-slate-500">{lead.failed_attempts} appels infructueux enregistrés{lead.failed_attempts >= 5 ? ' · Séquence automatique terminée' : ' sur 5'}</p>}
    {lead.next_placement && <p className="mt-1 text-xs text-blue-800">Test planifié</p>}
    {lead.closed_at && <p className="mt-1 text-xs">{LOST[lead.closure_reason] || NOT_QUALIFIED[lead.closure_reason]} · {dateLabel(lead.closed_at)}</p>}
    <footer className="mt-3 flex flex-wrap justify-between gap-1 border-t pt-2 text-xs text-slate-400"><span className="max-w-full truncate" title={lead.owner_name}>{lead.owner_name || 'Non attribué'}</span><span>{lead.last_activity_at ? dateLabel(lead.last_activity_at) : 'Aucune activité'}</span></footer>
  </article>;
}

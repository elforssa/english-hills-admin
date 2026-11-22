'use client';
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { programmeLabel } from '@/lib/ui/presentation.mjs';
import { LifecycleBadge } from './CrmShared';
import { ACTIVE, BOARD_STAGES, STATUS, LOST, NOT_QUALIFIED, SCHEDULE_KINDS, dateLabel, scheduledLabel, opportunityAction } from '@/lib/crm/presentation.mjs';
import { pluralFr } from '@/lib/ui/pluralFr.mjs';
// Today's items, grouped: stage routes · closure/reopen · assignment. Every item opens a guarded dialog.
export function OpportunityActions({ lead, onAction }) {
  const groups = [
    BOARD_STAGES.filter(stage => ![null, 'unsupported'].includes(opportunityAction(lead.status, stage))).map(stage => <DropdownMenuItem key={stage} onSelect={() => onAction(lead.id, opportunityAction(lead.status, stage))}>{stage === 'CONVERTED' ? 'Ouvrir l’inscription' : `Avancer · ${STATUS[stage]}`}</DropdownMenuItem>),
    ACTIVE.includes(lead.status) ? [<DropdownMenuItem key="lost" onSelect={() => onAction(lead.id, 'lost')}>Clôturer comme perdu</DropdownMenuItem>, <DropdownMenuItem key="notQualified" onSelect={() => onAction(lead.id, 'notQualified')}>Clôturer comme non qualifié</DropdownMenuItem>]
      : ['LOST', 'NOT_QUALIFIED'].includes(lead.status) ? [<DropdownMenuItem key="reopen" onSelect={() => onAction(lead.id, 'reopen')}>Rouvrir</DropdownMenuItem>] : [],
    [<DropdownMenuItem key="reassign" onSelect={() => onAction(lead.id, 'reassign')}>Attribuer un responsable</DropdownMenuItem>]
  ].filter(group => group.length);
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-9 w-9 shrink-0 p-0" aria-label={`Actions · ${lead.learner_name || lead.contact_name}`}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    {groups.map((group, index) => <Fragment key={index}>{index > 0 && <DropdownMenuSeparator />}{group}</Fragment>)}
  </DropdownMenuContent></DropdownMenu>;
}
// « En retard » comes from the server's next action (never « En attente »).
function overdue(lead) {
  return !!lead.next_action?.overdue;
}
// Board cards omit the stage (the column conveys it); list cards show it only under "Tous".
export default function OpportunityCard({ lead, onOpen, onAction, asOf, showStage = false }) {
  const active = ACTIVE.includes(lead.status), late = overdue(lead), next = lead.next_action;
  const qualifiers = [
    next?.schedule_kind === 'appointment' && SCHEDULE_KINDS.appointment,
    // Attempt 1 is the "Premier contact" title itself; later attempts are qualified.
    next?.attempt_ordinal > 1 && `Tentative ${next.attempt_ordinal} sur 5`,
    lead.failed_attempts > 0 && `${pluralFr(lead.failed_attempts, 'appel infructueux', 'appels infructueux')}${lead.failed_attempts >= 5 ? ' · Séquence automatique terminée' : ''}`,
    next?.relance_due && 'À relancer'
  ].filter(Boolean);
  const meta = [lead.source_label || 'Origine à préciser', lead.program && programmeLabel(lead.program), lead.last_activity_at ? `Dernière activité ${dateLabel(lead.last_activity_at)}` : 'Aucune activité'].filter(Boolean);
  return <article data-testid="opportunity-card" data-lead-id={lead.id} data-stage={lead.status} draggable={active} onDragStart={e => { e.dataTransfer.setData('application/eh-opportunity', JSON.stringify({ id: lead.id, status: lead.status })); e.dataTransfer.effectAllowed = 'move'; }} className="min-w-0 rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-sm">
    <div className="flex items-start gap-1">
      {/* One span child keeps parent and learner stacked even when the touch rule makes the button inline-flex.
          The overflow trigger stays in flow beside the whole identity block, so no identity line can sit under it. */}
      <button onClick={() => onOpen(lead.id)} className="min-h-9 w-full min-w-0 flex-1 justify-start text-left focus-visible:outline-blue-600"><span className="block min-w-0 text-left"><span className="block break-words font-semibold text-slate-900">{lead.contact_name}</span><span className="block break-words operational-secondary">{lead.learner_name || 'Apprenant à préciser'}{lead.learner_age != null ? ` · ${lead.learner_age} ans` : ''}</span></span></button>
      <OpportunityActions lead={lead} onAction={onAction} />
    </div>
    {showStage && <div className="mt-2"><LifecycleBadge status={lead.status}/></div>}
    <p className={`mt-1.5 break-words text-xs ${late ? 'text-red-700' : 'text-slate-700'}`}>{late ? 'En retard · ' : ''}{next ? next.label : lead.next_placement ? `Test de niveau · ${scheduledLabel(lead.next_placement)}` : active ? 'Prochaine action à choisir' : 'Suivi clos'}{qualifiers.length > 0 && <span className="text-slate-600"> · {qualifiers.join(' · ')}</span>}</p>
    {lead.closed_at && <p className="mt-1 text-xs">{LOST[lead.closure_reason] || NOT_QUALIFIED[lead.closure_reason]} · {dateLabel(lead.closed_at)}</p>}
    <p className="mt-1 break-words text-xs text-muted-foreground">{meta.join(' · ')}</p>
  </article>;
}

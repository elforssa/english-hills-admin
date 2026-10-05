'use client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import OperationalReadState from '@/components/operational/ReadState';
import { queryReadState } from '@/lib/ui/presentation.mjs';
import { STATUS } from '@/lib/crm/presentation.mjs';
import { CRM_STATUS_COLORS } from '@/lib/statusColors';
export function LifecycleBadge({ status }) {
  return <Badge variant="outline" className={`border-transparent font-medium ${CRM_STATUS_COLORS[status] || 'bg-slate-100 text-slate-700'}`}>{STATUS[status] || 'Statut non précisé'}</Badge>;
}
export function ReadState({ query, children, empty, filtered = false, onReset, available = true }) {
  const state = queryReadState(query, { empty: !!empty && !children, filtered, unavailable: !available });
  return <OperationalReadState state={state} message={['empty','filtered-empty'].includes(state) ? empty : undefined} onRetry={['error','stale'].includes(state) ? () => query.refetch() : undefined} onReset={state === 'filtered-empty' ? onReset : undefined}>{children}</OperationalReadState>;
}
export function Pager({ offset, total, size, onChange }) {
  return (total > size || offset > 0) && <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-xs text-muted-foreground"><span className="tabular-nums">{total > offset ? offset + 1 : 0}–{Math.min(offset + size, total)} sur {total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!offset} onClick={() => onChange(Math.max(0, offset - size))}>Précédent</Button><Button size="sm" variant="outline" disabled={offset + size >= total} onClick={() => onChange(offset + size)}>Suivant</Button></div></nav>;
}

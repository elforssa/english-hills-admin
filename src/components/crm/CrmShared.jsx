'use client';

import { Button } from '@/components/ui/button';
import { STATUS } from '@/lib/crm/presentation.mjs';
import { CRM_STATUS_COLORS } from '@/lib/statusColors';
export function LifecycleBadge({
  status
}) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CRM_STATUS_COLORS[status] || ''}`}>{STATUS[status] || 'Prospect'}</span>;
}
export function ReadState({
  query,
  children,
  empty
}) {
  if (query.isPending) return <p role="status" className="p-8 text-sm text-slate-500">Chargement…</p>;
  if (query.isError) return <div role="alert" className="p-6 text-sm">Impossible de charger ces informations. <Button variant="outline" onClick={() => query.refetch()}>Réessayer</Button></div>;
  return children || <p className="p-8 text-sm text-slate-500">{empty}</p>;
}
export function Pager({
  offset,
  total,
  size,
  onChange
}) {
  return (total > size || offset > 0) && <nav aria-label="Pagination" className="flex items-center justify-between gap-2 border-t p-4 text-xs text-slate-500"><span>{total > offset ? offset + 1 : 0}–{Math.min(offset + size, total)} sur {total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!offset} onClick={() => onChange(Math.max(0, offset - size))}>Précédent</Button><Button size="sm" variant="outline" disabled={offset + size >= total} onClick={() => onChange(offset + size)}>Suivant</Button></div></nav>;
}

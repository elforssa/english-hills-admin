'use client';

// =============================================================================
// /activity-log — read-only viewer for the public.activity_log audit trail.
//
// Triggers on the sensitive tables (migration 012/021) and the invite/role API
// routes write rows here; RLS ("activity_log select", migration 012) restricts
// reads to admin/director. before/after payloads are PII-scrubbed server-side,
// so only non-sensitive column values are ever shown.
//
// Plan SCG-r1 (REL-3): 50 entries at a time, newest first, filtered by the
// database (list_activity_log, keyset); before/after load only when a row is
// opened. Dates are Casablanca civil dates.
// =============================================================================

import { formatCentre } from '@/lib/centreClock.mjs';
import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getBrowserClient } from '@/lib/supabase';
import { History, Search } from 'lucide-react';
import ContextLink from '@/components/ContextLink';
import ReadState from '@/components/operational/ReadState';
import { queryReadState } from '@/lib/ui/presentation.mjs';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 50;

const ACTION_COLORS = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
};

// The centre's clock, like the Du/Au filters (centreClock, never a zone table).
function fmt(iso) {
  if (!iso) return '';
  return formatCentre(iso, 'fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function targetHref(row) {
  if (row.action === 'DELETE' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(row.target_id || '')) return null;
  const routes = { students: 'students', teachers: 'teachers', groups: 'groups', receipts: 'receipts' };
  const route = routes[row.target_table];
  return route ? `/${route}/${row.target_id}${route === 'receipts' ? '/print' : ''}` : null;
}

async function rpc(name, args) {
  const { data, error } = await getBrowserClient().rpc(name, args);
  if (error) throw error;
  return data;
}

function Snapshot({ id }) {
  const detail = useQuery({
    queryKey: ['ActivityLog', 'detail', id],
    queryFn: async () => {
      const { data, error } = await getBrowserClient().from('activity_log').select('before, after').eq('id', id).maybeSingle();
      if (error) throw error;
      return data || {};
    },
  });
  const show = value => value == null ? '—' : JSON.stringify(value, null, 2);
  return (
    <ReadState state={queryReadState(detail)} onRetry={() => detail.refetch()}>
      <div className="grid gap-3 md:grid-cols-2">
        {[['Avant', detail.data?.before], ['Après', detail.data?.after]].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
            <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{show(value)}</pre>
          </div>
        ))}
      </div>
    </ReadState>
  );
}

export default function ActivityLog() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(null);

  // The database filters; wait for a pause in typing before asking it.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim().slice(0, 120)), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const tables = useQuery({ queryKey: ['ActivityLog', 'tables'], queryFn: () => rpc('list_activity_log_tables') });
  const filters = { search, table, action, from, to };
  const invalidRange = Boolean(from && to && to < from);
  const log = useInfiniteQuery({
    queryKey: ['ActivityLog', 'page', filters],
    enabled: !invalidRange,
    initialPageParam: null,
    queryFn: ({ pageParam }) => rpc('list_activity_log', {
      p_before_created_at: pageParam?.created_at ?? null, p_before_id: pageParam?.id ?? null,
      p_table: table, p_action: action, p_from: from || null, p_to: to || null, p_search: search, p_limit: PAGE_SIZE,
    }),
    getNextPageParam: lastPage => lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1] : undefined,
    staleTime: 30 * 1000,
  });
  const rows = log.data?.pages.flat() ?? [];
  const filtered = Boolean(search || table || action || from || to);
  const reset = () => { setSearchInput(''); setSearch(''); setTable(''); setAction(''); setFrom(''); setTo(''); };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center gap-3 mb-6">
        <History size={20} style={{ color: 'var(--brand)' }} />
        <div>
          <h1 className="text-2xl font-bold">Journal d&apos;activité</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Traçabilité des actions sensibles (CNDP). Données personnelles masquées.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Rechercher (acteur, table, id)…"
            aria-label="Rechercher"
            maxLength={120}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <select aria-label="Table" className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={table} onChange={e => setTable(e.target.value)}>
          <option value="">Toutes les tables</option>
          {(tables.data || []).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Action" className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={action} onChange={e => setAction(e.target.value)}>
          <option value="">Toutes les actions</option>
          {['INSERT', 'UPDATE', 'DELETE'].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Du
          <input type="date" className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Au
          <input type="date" className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={to} onChange={e => setTo(e.target.value)} />
        </label>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {invalidRange ? (
          <div className="p-8 text-center text-muted-foreground text-sm">La date de fin précède la date de début.</div>
        ) : (
          <ReadState
            state={queryReadState(log, { empty: rows.length === 0, filtered })}
            message={rows.length === 0 ? (filtered ? 'Aucune entrée pour ces filtres.' : 'Aucune entrée.') : undefined}
            onRetry={() => log.refetch()}
            onReset={filtered ? reset : undefined}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    {['Date', 'Acteur', 'Action', 'Table', 'Colonnes modifiées', 'Cible', ''].map(h => (
                      <th key={h || 'detail'} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(r => (
                    <ActivityRow key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </ReadState>
        )}
      </div>
      {!invalidRange && rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">{rows.length} entrée(s) affichée(s), les plus récentes d&apos;abord.</p>
          {log.hasNextPage && (
            <Button variant="outline" size="sm" disabled={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>
              {log.isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ row: r, open, onToggle }) {
  return (
    <>
      <tr className="hover:bg-muted/30 align-top">
        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmt(r.created_at)}</td>
        <td className="px-4 py-3">{r.actor_email || <span className="text-muted-foreground italic">système</span>}</td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[r.action] || 'bg-gray-100 text-gray-600'}`}>{r.action}</span>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{r.target_table}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {Array.isArray(r.changed_columns) && r.changed_columns.length > 0
            ? r.changed_columns.join(', ')
            : '—'}
        </td>
        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{targetHref(r) ? <ContextLink href={targetHref(r)} className="inline-flex min-h-10 items-center text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded" aria-label={`Ouvrir ${r.target_table} ${r.target_id}`}>{r.target_id.slice(0, 8)}</ContextLink> : r.target_id ? r.target_id.slice(0, 8) : '—'}</td>
        <td className="px-4 py-3">
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>{open ? 'Masquer' : 'Détails'}</Button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-muted/20"><Snapshot id={r.id} /></td>
        </tr>
      )}
    </>
  );
}

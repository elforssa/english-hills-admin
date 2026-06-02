'use client';

// =============================================================================
// /activity-log — read-only viewer for the public.activity_log audit trail.
//
// Triggers on the sensitive tables (migration 012/021) and the invite/role API
// routes write rows here; RLS ("activity_log select", migration 012) restricts
// reads to admin/director. before/after payloads are PII-scrubbed server-side,
// so only non-sensitive column values are ever shown.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { entities } from '@/lib/entities';
import { History, Search } from 'lucide-react';

const ACTION_COLORS = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
};

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-MA', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ActivityLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    entities.ActivityLog.list('-created_date', 500)
      .then(setRows)
      .catch(() => { /* entities.js already toasted */ })
      .finally(() => setLoading(false));
  }, []);

  const tables = useMemo(
    () => Array.from(new Set(rows.map(r => r.target_table).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = rows.filter(r =>
    (!table || r.target_table === table) &&
    (!action || r.action === action) &&
    (!search ||
      r.actor_email?.toLowerCase().includes(search.toLowerCase()) ||
      r.target_table?.toLowerCase().includes(search.toLowerCase()) ||
      r.target_id?.toLowerCase().includes(search.toLowerCase())),
  );

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
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={table} onChange={e => setTable(e.target.value)}>
          <option value="">Toutes les tables</option>
          {tables.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={action} onChange={e => setAction(e.target.value)}>
          <option value="">Toutes les actions</option>
          {['INSERT', 'UPDATE', 'DELETE'].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Aucune entrée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                  {['Date', 'Acteur', 'Action', 'Table', 'Colonnes modifiées', 'Cible'].map(h => (
                    <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-muted/30 align-top">
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
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.target_id ? r.target_id.slice(0, 8) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!loading && <p className="text-xs text-muted-foreground mt-3">{filtered.length} entrée(s) affichée(s) (500 plus récentes max).</p>}
    </div>
  );
}

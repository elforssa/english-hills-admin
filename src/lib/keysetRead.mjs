// Full reads by keyset (plan SCG-r1, REL-3): every row of a filtered query in the
// database's own order — (column, id), NULLs where Postgres puts them (last when
// ascending, first when descending) — without an exact count. A row inserted or
// deleted by someone else during the read no longer aborts it; a row whose sort
// value changes mid-read is returned once.
//
// One request reads a table smaller than a page: a short page ends the read. The
// page size equals PostgREST's max_rows (1000, supabase/config.toml); a smaller
// server cap would end a read early, so the page size must never exceed it.
export const KEYSET_PAGE_SIZE = 1000;

// PostgREST value for a logic-tree filter: quoted, with " and \ escaped.
export function quoteValue(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

// Adds the order and the cursor that follows `last` to a fresh PostgREST query.
// NULLs sort last ascending and first descending, as Postgres sorts by default.
export function applyKeyset(query, { column, ascending, last }) {
  if (column === 'id') {
    const q = query.order('id', { ascending: true });
    return last ? q.gt('id', last.id) : q;
  }
  const q = query.order(column, { ascending, nullsFirst: !ascending }).order('id', { ascending: true });
  if (!last) return q;
  const id = quoteValue(last.id);
  if (last[column] == null) {
    // Within the NULL block; ascending, it is the last block.
    return q.or(ascending ? `and(${column}.is.null,id.gt.${id})` : `and(${column}.is.null,id.gt.${id}),${column}.not.is.null`);
  }
  const value = quoteValue(last[column]);
  const after = `${column}.${ascending ? 'gt' : 'lt'}.${value},and(${column}.eq.${value},id.gt.${id})`;
  return q.or(ascending ? `${after},${column}.is.null` : after);
}

/**
 * keysetReadAll(fetchPage, { pageSize }) → Promise<Row[]>
 * fetchPage({ last, limit }) returns PostgREST's { data, error }.
 */
export async function keysetReadAll(fetchPage, { pageSize = KEYSET_PAGE_SIZE } = {}) {
  const rows = [];
  const seen = new Set();
  let last = null;
  for (;;) {
    const { data, error } = await fetchPage({ last, limit: pageSize });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Incomplete keyset response');
    for (const row of data) {
      if (row?.id == null) throw new Error('Keyset read needs an id on every row');
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    if (data.length < pageSize) return rows;
    const next = data[data.length - 1];
    if (last && next.id === last.id) throw new Error('Keyset read did not advance');
    last = next;
  }
}

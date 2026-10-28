// Full reads by keyset (plan SCG-r1, REL-3): every row of a filtered query in the
// database's own order — (column, id), NULLs where Postgres puts them (last when
// ascending, first when descending) — without an exact count. A row inserted or
// deleted by someone else during the read no longer aborts it; a row whose sort
// value changes mid-read is returned once. The loop ends on an empty page, so a
// server-side row cap smaller than the page size cannot truncate the result.

// PostgREST value for a logic-tree filter: quoted, with " and \ escaped.
export function quoteValue(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

// The phases that cover every row once, in order.
export function keysetPhases(column, ascending) {
  if (column === 'id') return ['id'];
  return ascending ? ['value', 'null'] : ['null', 'value'];
}

// Adds the phase's predicate, order and cursor to a fresh PostgREST query.
export function applyKeyset(query, { column, ascending, phase, last }) {
  if (phase === 'id' || phase === 'null') {
    let q = phase === 'null' ? query.is(column, null) : query;
    q = q.order('id', { ascending: true });
    return last ? q.gt('id', last.id) : q;
  }
  let q = query.not(column, 'is', null).order(column, { ascending }).order('id', { ascending: true });
  if (last) {
    const value = quoteValue(last[column]);
    q = q.or(`${column}.${ascending ? 'gt' : 'lt'}.${value},and(${column}.eq.${value},id.gt.${quoteValue(last.id)})`);
  }
  return q;
}

/**
 * keysetReadAll(fetchPage, { column, ascending, pageSize }) → Promise<Row[]>
 * fetchPage({ phase, last, limit }) returns PostgREST's { data, error }.
 */
export async function keysetReadAll(fetchPage, { column = 'id', ascending = true, pageSize = 1000 } = {}) {
  const rows = [];
  const seen = new Set();
  for (const phase of keysetPhases(column, ascending)) {
    let last = null;
    for (;;) {
      const { data, error } = await fetchPage({ phase, last, limit: pageSize });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Incomplete keyset response');
      if (data.length === 0) break;
      for (const row of data) {
        if (row?.id == null) throw new Error('Keyset read needs an id on every row');
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
      const next = data[data.length - 1];
      if (last && next.id === last.id) throw new Error('Keyset read did not advance');
      last = next;
    }
  }
  return rows;
}

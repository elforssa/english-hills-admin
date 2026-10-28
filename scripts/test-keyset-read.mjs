// Keyset full reads (plan SCG-r1, REL-3): database order with NULL phases, no
// abort on concurrent inserts and deletes, no duplicate when a sort value
// changes, and no truncation by a server row cap smaller than the page size.
import assert from 'node:assert/strict';
import { applyKeyset, keysetPhases, keysetReadAll, quoteValue } from '../src/lib/keysetRead.mjs';

// A fake table that answers the same phase/cursor contract as PostgREST, with
// Postgres ordering (NULLS LAST ascending, NULLS FIRST descending) and a row cap.
function table(rows, { cap = Infinity } = {}) {
  const calls = [];
  const fetchPage = ({ column, ascending }) => async ({ phase, last, limit }) => {
    calls.push(phase);
    let set = rows.filter(r => phase === 'id' ? true : phase === 'null' ? r[column] == null : r[column] != null);
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    set.sort((a, b) => (phase === 'value' ? (ascending ? 1 : -1) * cmp(a[column], b[column]) : 0) || cmp(a.id, b.id));
    if (last) {
      set = set.filter(r => phase !== 'value' ? r.id > last.id
        : (ascending ? r[column] > last[column] : r[column] < last[column]) || (r[column] === last[column] && r.id > last.id));
    }
    return { data: set.slice(0, Math.min(limit, cap)).map(r => ({ ...r })), error: null };
  };
  return { calls, fetchPage };
}

const base = Array.from({ length: 2405 }, (_, i) => ({
  id: `id-${String(i).padStart(5, '0')}`, name: i % 7 === 0 ? null : `n${String((i * 37) % 1000).padStart(4, '0')}`,
}));
const expected = (ascending) => {
  const nonNull = base.filter(r => r.name != null).sort((a, b) => (ascending ? 1 : -1) * a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const nulls = base.filter(r => r.name == null).sort((a, b) => a.id.localeCompare(b.id));
  return ascending ? [...nonNull, ...nulls] : [...nulls, ...nonNull];
};

for (const ascending of [true, false]) {
  const { fetchPage } = table(base);
  const rows = await keysetReadAll(fetchPage({ column: 'name', ascending }), { column: 'name', ascending, pageSize: 500 });
  assert.deepEqual(rows.map(r => r.id), expected(ascending).map(r => r.id), `order ${ascending ? 'asc' : 'desc'} with NULL phases`);
}
assert.deepEqual(keysetPhases('id', true), ['id']);
assert.deepEqual(keysetPhases('name', true), ['value', 'null']);
assert.deepEqual(keysetPhases('created_at', false), ['null', 'value']);

// A server cap below the page size never truncates.
{
  const { fetchPage } = table(base, { cap: 300 });
  const rows = await keysetReadAll(fetchPage({ column: 'id', ascending: true }), { pageSize: 1000 });
  assert.equal(rows.length, base.length);
}

// Concurrent inserts and deletes between pages: no abort, no duplicate; rows that
// existed throughout and stayed are all returned.
{
  const live = base.map(r => ({ ...r }));
  const { fetchPage } = table(live);
  const read = fetchPage({ column: 'id', ascending: true });
  let page = 0;
  const rows = await keysetReadAll(async (args) => {
    page += 1;
    if (page === 2) { live.push({ id: 'id-00000-new', name: 'x' }, { id: 'id-99999', name: 'y' }); live.splice(10, 1); }
    return read(args);
  }, { pageSize: 500 });
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  assert.ok(rows.some(r => r.id === 'id-99999'), 'a row inserted after the cursor is read');
  const survivors = base.filter(r => r.id !== base[10].id).map(r => r.id);
  assert.ok(survivors.every(id => rows.some(r => r.id === id)));
}

// A sort value that changes mid-read is returned once.
{
  const live = base.map(r => ({ ...r }));
  const { fetchPage } = table(live);
  const read = fetchPage({ column: 'name', ascending: true });
  let page = 0;
  const rows = await keysetReadAll(async (args) => {
    page += 1;
    if (page === 2) live.find(r => r.id === 'id-00001').name = 'zzzz';
    return read(args);
  }, { column: 'name', ascending: true, pageSize: 500 });
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
}

// Errors and malformed pages fail the read.
await assert.rejects(() => keysetReadAll(async () => ({ data: null, error: new Error('network failed') })), /network failed/);
await assert.rejects(() => keysetReadAll(async () => ({ data: null, error: null })), /Incomplete/);
await assert.rejects(() => keysetReadAll(async () => ({ data: [{ name: 'x' }], error: null })), /needs an id/);
await assert.rejects(() => keysetReadAll(async () => ({ data: [{ id: 'a' }], error: null })), /did not advance/);

// The PostgREST predicate: quoting and cursor shape.
assert.equal(quoteValue('a,b"c\\d'), '"a,b\\"c\\\\d"');
const recorded = [];
const builder = new Proxy({}, { get: (_, name) => (...args) => { recorded.push([name, ...args]); return builder; } });
applyKeyset(builder, { column: 'created_at', ascending: false, phase: 'value', last: { id: 'u1', created_at: '2026-10-28T05:00:00.1+00:00' } });
assert.deepEqual(recorded, [
  ['not', 'created_at', 'is', null], ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: true }],
  ['or', 'created_at.lt."2026-10-28T05:00:00.1+00:00",and(created_at.eq."2026-10-28T05:00:00.1+00:00",id.gt."u1")']]);
recorded.length = 0;
applyKeyset(builder, { column: 'name', ascending: true, phase: 'null', last: { id: 'u2' } });
assert.deepEqual(recorded, [['is', 'name', null], ['order', 'id', { ascending: true }], ['gt', 'id', 'u2']]);
console.log('PASS keyset reads: database order with NULL phases, server caps, concurrent writes, errors and PostgREST predicates');

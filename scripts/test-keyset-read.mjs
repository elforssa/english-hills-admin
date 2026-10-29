// Keyset full reads (plan SCG-r1, REL-3): database order with NULLs where Postgres
// puts them, one request for a table smaller than a page, no abort on concurrent
// inserts and deletes, no duplicate when a sort value changes, and the PostgREST
// predicates the reader sends.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEYSET_PAGE_SIZE, applyKeyset, keysetReadAll, quoteValue } from '../src/lib/keysetRead.mjs';

// A fake table answering the reader's contract with Postgres ordering
// (ASC NULLS LAST, DESC NULLS FIRST, then id) and the cursor rule applyKeyset encodes.
function table(rows, column, ascending) {
  let requests = 0;
  const key = r => (r[column] == null ? (ascending ? [1, ''] : [0, '']) : [ascending ? 0 : 1, r[column]]);
  const cmp = (a, b) => {
    const [ga, va] = key(a); const [gb, vb] = key(b);
    if (ga !== gb) return ga - gb;
    if (va !== vb) return (ascending ? 1 : -1) * (va < vb ? -1 : 1);
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  const fetchPage = async ({ last, limit }) => {
    requests += 1;
    const sorted = [...rows].sort(cmp);
    const after = last ? sorted.filter(r => cmp(r, last) > 0) : sorted;
    return { data: after.slice(0, limit).map(r => ({ ...r })), error: null };
  };
  return { fetchPage, requests: () => requests, sorted: () => [...rows].sort(cmp) };
}
const make = n => Array.from({ length: n }, (_, i) => ({
  id: `id-${String(i).padStart(5, '0')}`, name: i % 7 === 0 ? null : `n${String((i * 37) % 1000).padStart(4, '0')}`,
}));

// Order, for a nullable column both ways.
for (const ascending of [true, false]) {
  const rows = make(2405);
  const t = table(rows, 'name', ascending);
  const read = await keysetReadAll(t.fetchPage, { pageSize: 500 });
  assert.deepEqual(read.map(r => r.id), t.sorted().map(r => r.id), `order ${ascending ? 'asc' : 'desc'}`);
}

// Request count: one request below a page, whatever the column's nullability.
for (const [n, expected] of [[0, 1], [1, 1], [999, 1], [1000, 2], [1001, 2], [2405, 3]]) {
  for (const column of ['name', 'id']) {
    const t = table(make(n), column, true);
    const read = await keysetReadAll(t.fetchPage);
    assert.equal(read.length, n);
    assert.equal(t.requests(), expected, `${n} rows by ${column}: ${t.requests()} requests`);
  }
}
// The page size never exceeds PostgREST's max_rows, so a full page is a real page.
assert.equal(KEYSET_PAGE_SIZE, Number(readFileSync('supabase/config.toml', 'utf8').match(/^max_rows\s*=\s*(\d+)/m)[1]));

// Concurrent inserts and deletes between pages: no abort, no duplicate; rows that
// existed throughout and stayed are all returned.
{
  const live = make(2405);
  const t = table(live, 'id', true);
  let page = 0;
  const read = await keysetReadAll(async (args) => {
    page += 1;
    if (page === 2) { live.push({ id: 'id-00000-new', name: 'x' }, { id: 'id-99999', name: 'y' }); live.splice(10, 1); }
    return t.fetchPage(args);
  }, { pageSize: 500 });
  assert.equal(new Set(read.map(r => r.id)).size, read.length);
  assert.ok(read.some(r => r.id === 'id-99999'), 'a row inserted after the cursor is read');
  assert.ok(make(2405).filter((_, i) => i !== 10).every(r => read.some(x => x.id === r.id)));
}
// A sort value that changes mid-read is returned once.
{
  const live = make(2405);
  const t = table(live, 'name', true);
  let page = 0;
  const read = await keysetReadAll(async (args) => {
    page += 1;
    if (page === 2) live.find(r => r.id === 'id-00001').name = 'zzzz';
    return t.fetchPage(args);
  }, { pageSize: 500 });
  assert.equal(new Set(read.map(r => r.id)).size, read.length);
}

// PR #172 review B2: a server (or test stub) that answers every read of a small
// table with the same rows and ignores the cursor. The first reader asked for a
// second page, got the same row back and threw "did not advance"; a short page now
// ends the read after one request.
{
  let requests = 0;
  const read = await keysetReadAll(async () => { requests += 1; return { data: [{ id: 'only' }], error: null }; });
  assert.deepEqual(read, [{ id: 'only' }]);
  assert.equal(requests, 1);
}

// Errors and malformed pages fail the read.
await assert.rejects(() => keysetReadAll(async () => ({ data: null, error: new Error('network failed') })), /network failed/);
await assert.rejects(() => keysetReadAll(async () => ({ data: null, error: null })), /Incomplete/);
await assert.rejects(() => keysetReadAll(async () => ({ data: [{ name: 'x' }], error: null })), /needs an id/);
await assert.rejects(() => keysetReadAll(async () => ({ data: [{ id: 'a' }], error: null }), { pageSize: 1 }), /did not advance/);

// The PostgREST predicates: order with explicit NULL placement, quoting, cursors.
assert.equal(quoteValue('a,b"c\\d'), '"a,b\\"c\\\\d"');
const recorded = [];
const builder = new Proxy({}, { get: (_, name) => (...args) => { recorded.push([name, ...args]); return builder; } });
const at = '2026-10-28T05:00:00.1+00:00';
const cases = [
  [{ column: 'created_at', ascending: false, last: null }, [['order', 'created_at', { ascending: false, nullsFirst: true }], ['order', 'id', { ascending: true }]]],
  [{ column: 'created_at', ascending: false, last: { id: 'u1', created_at: at } },
    [['order', 'created_at', { ascending: false, nullsFirst: true }], ['order', 'id', { ascending: true }],
      ['or', `created_at.lt."${at}",and(created_at.eq."${at}",id.gt."u1")`]]],
  [{ column: 'created_at', ascending: false, last: { id: 'u1', created_at: null } },
    [['order', 'created_at', { ascending: false, nullsFirst: true }], ['order', 'id', { ascending: true }],
      ['or', 'and(created_at.is.null,id.gt."u1"),created_at.not.is.null']]],
  [{ column: 'name', ascending: true, last: { id: 'u2', name: 'A, B' } },
    [['order', 'name', { ascending: true, nullsFirst: false }], ['order', 'id', { ascending: true }],
      ['or', 'name.gt."A, B",and(name.eq."A, B",id.gt."u2"),name.is.null']]],
  [{ column: 'name', ascending: true, last: { id: 'u2', name: null } },
    [['order', 'name', { ascending: true, nullsFirst: false }], ['order', 'id', { ascending: true }], ['or', 'and(name.is.null,id.gt."u2")']]],
  [{ column: 'id', ascending: true, last: { id: 'u3' } }, [['order', 'id', { ascending: true }], ['gt', 'id', 'u3']]],
];
for (const [args, expected] of cases) {
  recorded.length = 0;
  applyKeyset(builder, args);
  assert.deepEqual(recorded, expected, JSON.stringify(args));
}
console.log('PASS keyset reads: database order with NULLs, one request below a page (0/1/999 rows), concurrent writes, errors and PostgREST predicates');

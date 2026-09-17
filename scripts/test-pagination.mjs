import assert from 'node:assert/strict';
import { paginateAll } from '../src/lib/paginateAll.mjs';

const dataset = Array.from({ length: 1205 }, (_, i) => ({ id: String(i + 1) }));
const pages = [];
const result = await paginateAll(async (from, to) => {
  pages.push([from, to]);
  return { data: dataset.slice(from, to + 1), count: dataset.length, error: null };
});
assert.equal(result.length, 1205);
assert.deepEqual(pages, [[0, 499], [500, 999], [1000, 1499]]);
await assert.rejects(() => paginateAll(async (from) => from === 0
  ? { data: dataset.slice(0, 500), count: 1205, error: null }
  : { data: null, count: null, error: new Error('network failed') }), /network failed/);
await assert.rejects(() => paginateAll(async (from) => from === 0
  ? { data: dataset.slice(0, 500), count: 1205, error: null }
  : { data: [], count: 1205, error: null }), /Incomplete/);
await assert.rejects(() => paginateAll(async (from) => from === 0
  ? { data: dataset.slice(0, 500), count: 1205, error: null }
  : { data: dataset.slice(0, 500), count: 1205, error: null }), /Dataset changed/);
console.log('PASS complete pagination, failure and changed-dataset guards');

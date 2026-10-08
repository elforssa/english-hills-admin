// Read retry policy: network-level failures get up to three retries; server answers keep one.
import assert from 'node:assert/strict';
import { isTransientReadFailure, shouldRetryRead } from '../src/lib/queryRetry.mjs';

const transient = [
  new TypeError('Failed to fetch'),
  new TypeError('Load failed'),
  { message: 'TypeError: NetworkError when attempting to fetch resource.', code: '' },
  { message: '<html>502 Bad Gateway</html>', code: '' },
  { message: 'upstream request timeout' },
  new Error('Dataset changed during pagination; retry'),
  undefined,
];
const answered = [
  { code: '42501', message: 'permission denied for table students' },
  { code: '40001', message: 'Student unavailable or stale' },
  { code: 'P0001', message: 'raised' },
  { code: 'PT409', message: 'crm_reconciliation_lease_lost' },
  { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
  { code: 'PGRST301', message: 'JWT expired' },
];
for (const error of transient) {
  assert.equal(isTransientReadFailure(error), true, JSON.stringify(error?.message ?? error));
  assert.deepEqual([0, 1, 2, 3].map(n => shouldRetryRead(n, error)), [true, true, true, false]);
}
for (const error of answered) {
  assert.equal(isTransientReadFailure(error), false, error.code);
  assert.deepEqual([0, 1].map(n => shouldRetryRead(n, error)), [true, false], 'server answers keep the previous single retry');
}
console.log(`PASS read retry policy (${transient.length} transient, ${answered.length} answered)`);

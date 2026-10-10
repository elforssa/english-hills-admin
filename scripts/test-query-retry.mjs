// Read retry policy: only allowlisted transient failures get up to three retries;
// every answered failure (coded or not) keeps the single retry main had.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isTransientReadFailure, shouldRetryRead } from '../src/lib/queryRetry.mjs';

// The lifecycle server-gate read throws this shape for a non-OK response.
const httpFailure = status => Object.assign(new Error('status_unavailable'), { status });

const transient = {
  'fetch TypeError (Chromium)': new TypeError('Failed to fetch'),
  'fetch TypeError (WebKit)': new TypeError('Load failed'),
  'fetch TypeError (Node)': new TypeError('fetch failed'),
  'network error wrapped by supabase-js': { message: 'TypeError: NetworkError when attempting to fetch resource.', details: '', hint: '', code: '' },
  'network request failed': new Error('Network request failed'),
  'offline message': new Error('net::ERR_INTERNET_DISCONNECTED'),
  'timeout (TimeoutError)': Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }),
  'timeout (proxy message)': { message: 'upstream request timeout' },
  'gateway 502 status': httpFailure(502),
  'gateway 503 status': httpFailure(503),
  'gateway 504 status': httpFailure(504),
  'gateway 502 HTML body': { message: '<html><head><title>502 Bad Gateway</title></head></html>', code: '' },
  'gateway 502 JSON body': { message: 'An invalid response was received from the upstream server' },
  'gateway 503 body': { message: 'Service Unavailable' },
  'gateway 504 body': { message: '<html>504 Gateway Time-out</html>' },
  'pagination drift': new Error('Dataset changed during pagination; retry'),
};
const answered = {
  'SQLSTATE 42501': { code: '42501', message: 'permission denied for table students' },
  'SQLSTATE 40001': { code: '40001', message: 'Student unavailable or stale' },
  'SQLSTATE P0001': { code: 'P0001', message: 'raised' },
  'SQLSTATE PT409': { code: 'PT409', message: 'crm_reconciliation_lease_lost' },
  'coded statement timeout': { code: '57014', message: 'canceling statement due to statement timeout' },
  'PGRST116': { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
  'PGRST301': { code: 'PGRST301', message: 'JWT expired' },
  'PGRST003 pool timeout': { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' },
  // Answered HTTP failures that carry no code.
  '401 status': httpFailure(401),
  '403 status': httpFailure(403),
  '404 status': httpFailure(404),
  '409 status': httpFailure(409),
  '429 status': httpFailure(429),
  '500 status': httpFailure(500),
  '500 status with a timeout message': Object.assign(new Error('request timeout'), { status: 500 }),
  '401 body without code': { message: 'Invalid authentication credentials' },
  '429 body without code': { message: 'API rate limit exceeded' },
  '500 body without code': { message: 'Internal Server Error' },
  'synthetic 500 of the UI-foundation browser suite': { message: 'Synthetic safe read failure' },
  'programming TypeError': new TypeError("Cannot read properties of undefined (reading 'rows')"),
  'empty error': {},
  'undefined error': undefined,
};
for (const [name, error] of Object.entries(transient)) {
  assert.equal(isTransientReadFailure(error), true, name);
  assert.deepEqual([0, 1, 2, 3].map(n => shouldRetryRead(n, error)), [true, true, true, false], name);
}
for (const [name, error] of Object.entries(answered)) {
  assert.equal(isTransientReadFailure(error), false, name);
  assert.deepEqual([0, 1].map(n => shouldRetryRead(n, error)), [true, false], `${name}: keeps the single retry main had`);
}

// Offline: any read failure while the browser reports offline is transient.
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
try {
  assert.equal(isTransientReadFailure({ message: 'Internal Server Error' }), true, 'offline');
  assert.equal(isTransientReadFailure(httpFailure(401)), false, 'an HTTP answer is not offline');
} finally {
  if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
  else delete globalThis.navigator;
}

// Wiring: the policy applies to query defaults and CRM reads only; mutations keep
// TanStack's default of no retry; the lifecycle gate exposes its HTTP status.
const queryClient = readFileSync(new URL('../src/lib/query-client.js', import.meta.url), 'utf8');
assert.match(queryClient, /queries:\s*\{[^}]*retry: shouldRetryRead/);
assert.doesNotMatch(queryClient, /mutations\s*:/, 'mutation defaults are not configured, so mutations are never retried');
assert.match(readFileSync(new URL('../src/lib/crm/queries.js', import.meta.url), 'utf8'), /retry: shouldRetryRead/);
assert.match(readFileSync(new URL('../src/components/crm/LifecycleOperations.jsx', import.meta.url), 'utf8'),
  /throw Object\.assign\(new Error\('status_unavailable'\), \{ status: response\.status \}\)/);

console.log(`PASS read retry policy (${Object.keys(transient).length} transient, ${Object.keys(answered).length} answered, offline, wiring)`);

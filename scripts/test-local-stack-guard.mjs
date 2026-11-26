// Follow-ups 142 (owner item 11): the local-stack guard (scripts/lib/local-stack.mjs).
//   1. Unit: on a temporary supabase/config.toml and a fake docker, the guard refuses a missing
//      or wrong HILLS_LOCAL_STACK, a database port, API URL or container that is not the
//      config's, a stopped container and a port another stack publishes; it accepts the match.
//      resetLocalDatabase refuses before running anything.
//   2. Ratchet: every script that hard-codes this checkout's database port, API port or
//      database container, or runs « supabase db reset », calls the guard; no script or CI step
//      runs « supabase db reset » except through it; the CI job names the stack.
// No database, no network: pure, part of npm test.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { LocalStackRefusal, REPO_ROOT, assertLocalStack, readStackConfig, resetLocalDatabase } from './lib/local-stack.mjs';

// 1. Unit.
const root = mkdtempSync(join(tmpdir(), 'hills-local-stack-'));
mkdirSync(join(root, 'supabase'));
writeFileSync(join(root, 'supabase', 'config.toml'), `# synthetic
project_id = "demo-stack" # the CLI's stack
[api]
enabled = true
port = 61321
[db]
port = 61322
shadow_port = 61320
[studio]
port = 61323
`);
const ports = { 'supabase_db_demo-stack': { '5432/tcp': [{ HostPort: '61322' }] }, 'supabase_kong_demo-stack': { '8000/tcp': [{ HostPort: '61321' }] } };
const inspect = name => { if (!ports[name]) throw new Error('No such object'); return JSON.stringify(ports[name]); };
const env = { HILLS_LOCAL_STACK: 'demo-stack' };
const ok = (options = {}) => assertLocalStack({ root, env, inspect, ...options });
const refused = (options, pattern, label) => assert.throws(() => assertLocalStack({ root, env, inspect, ...options }), error => error instanceof LocalStackRefusal && pattern.test(error.message), label);

assert.deepEqual(readStackConfig(root), { projectId: 'demo-stack', apiPort: '61321', dbPort: '61322', apiUrl: 'http://127.0.0.1:61321', container: 'supabase_db_demo-stack', apiContainer: 'supabase_kong_demo-stack' });
assert.equal(ok({ dbPort: '61322', apiUrl: 'http://127.0.0.1:61321', container: 'supabase_db_demo-stack' }).projectId, 'demo-stack');
assert.equal(ok({ dbPort: 61322, apiUrl: 'http://localhost:61321/rest/v1' }).dbPort, '61322');
refused({ env: {} }, /HILLS_LOCAL_STACK is not set; export HILLS_LOCAL_STACK=demo-stack/, 'no stack named');
refused({ env: { HILLS_LOCAL_STACK: 'hills-admin-next' } }, /HILLS_LOCAL_STACK=hills-admin-next but the Supabase CLI here uses stack demo-stack/, 'another stack named');
refused({ dbPort: '54322' }, /database port 54322 is not stack demo-stack's \[db\] port 61322/, 'the hard-coded repository port on another stack');
refused({ apiUrl: 'http://127.0.0.1:54321' }, /API URL http:\/\/127\.0\.0\.1:54321 is not stack demo-stack's \[api\] port 61321/, 'the hard-coded API port on another stack');
refused({ apiUrl: 'https://project.supabase.co' }, /not a loopback address/, 'a cloud URL');
refused({ apiUrl: 'not a url' }, /is not a URL/, 'garbage');
refused({ container: 'supabase_db_hills-admin-next' }, /container supabase_db_hills-admin-next is not stack demo-stack's database container supabase_db_demo-stack/, 'the fixed container name on another stack');
refused({ inspect: () => { throw new Error('No such object'); } }, /container supabase_db_demo-stack is not running/, 'stack not started');
refused({ inspect: name => JSON.stringify(name.startsWith('supabase_db_') ? { '5432/tcp': [{ HostPort: '54322' }] } : ports[name]) }, /publishes 54322, not the \[db\] port 61322/, 'the container publishes another port');
refused({ inspect: name => JSON.stringify(name.startsWith('supabase_kong_') ? { '8000/tcp': [] } : ports[name]) }, /supabase_kong_demo-stack publishes no port, not the \[api\] port 61321/, 'no API port');
assert.throws(() => resetLocalDatabase(['--linked'], { root, env }), /local stack only/, 'never a linked project');
assert.throws(() => resetLocalDatabase(['--db-url=postgresql://x'], { root, env }), /local stack only/, 'never a database URL');
assert.throws(() => resetLocalDatabase(['--no-seed'], { root, env: {} }), /HILLS_LOCAL_STACK is not set/, 'reset refused before the CLI runs');
writeFileSync(join(root, 'supabase', 'config.toml'), '[db]\nport = 61322\n');
refused({}, /no valid project_id/, 'config without project_id');
console.log('PASS local-stack guard: stack name, ports, container and published ports; reset refused before the CLI');

// 2. Ratchet over the repository (built from this checkout's own config, so a renamed clone
// is checked against its own stack).
const stack = readStackConfig(REPO_ROOT);
assert.equal(stack.container, `supabase_db_${stack.projectId}`);
const literal = new RegExp(`\\b(${stack.dbPort}|${stack.apiPort})\\b|${stack.container.replace(/[.-]/g, '\\$&')}`);
const reset = /supabase['",\s]+db['",\s]+reset|'db',\s*'reset'/;
const guarded = /assertLocalStack\(|assert_local_stack\(|reset_local_database\(|local-stack\.mjs" (assert|db-reset)/;
// Files with a literal that never reach a stack (static data or a comment only).
const STATIC = {
  'scripts/lib/storage-inventory.mjs': 'pure classifier; the default origin is data (the local caller is storage-inventory-local.mjs, guarded)',
  'scripts/lib/webkit-cancelled-fetch.mjs': 'a comment showing a WebKit message',
  'scripts/test-webkit-cancelled-fetch.mjs': 'pure unit test of synthetic page events',
  'scripts/test-crm-phase12-artifacts.py': 'reads .env.local and build output only; never connects',
};
const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (name === 'node_modules' || name === 'fixtures') return [];
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const scripts = walk(join(REPO_ROOT, 'scripts')).filter(path => /\.(mjs|js|py|sh)$/.test(path)).map(path => relative(REPO_ROOT, path));
const unguarded = [], directResets = [];
for (const path of scripts) {
  if (path === 'scripts/lib/local-stack.mjs' || path === 'scripts/lib/local_stack.py' || path === 'scripts/test-local-stack-guard.mjs') continue;
  const text = readFileSync(join(REPO_ROOT, path), 'utf8');
  const code = text.split('\n').filter(line => !/^\s*(\/\/|#)/.test(line)).join('\n');
  if ((literal.test(code) || reset.test(code)) && !guarded.test(text) && !STATIC[path]) unguarded.push(path);
  if (reset.test(code)) directResets.push(path);
}
assert.deepEqual(unguarded, [], 'every script that hard-codes the stack or resets it calls the guard');
assert.deepEqual(directResets, [], 'no script runs « supabase db reset » except through resetLocalDatabase / reset_local_database / local-stack.mjs db-reset');
for (const path of Object.keys(STATIC)) assert.ok(scripts.includes(path), `${path} still exists (prune the allowlist)`);
const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/verify.yml'), 'utf8');
assert.doesNotMatch(workflow, /supabase db reset/, 'CI resets go through local-stack.mjs db-reset');
assert.match(workflow, /\n {6}HILLS_LOCAL_STACK: hills-admin-next\n/, 'the local-database job names the stack');
assert.match(workflow, /- run: supabase start\n {6}- name: Local-stack guard[^\n]*\n {8}run: node scripts\/lib\/local-stack\.mjs assert --db-port 54322 --api-url http:\/\/127\.0\.0\.1:54321 --container supabase_db_hills-admin-next\n/, 'CI checks the guard right after supabase start');
console.log(`PASS local-stack ratchet: ${scripts.length} scripts checked; every hard-coded port, container or reset goes through the guard; CI names the stack`);

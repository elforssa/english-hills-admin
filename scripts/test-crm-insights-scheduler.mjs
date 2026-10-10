// DGI-A D3 scheduler: bearer, server live gate, 45 s claim budget, 5-run bound,
// counts-only response and single finalisation under concurrent ticks. Stubs only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runScheduledInsights } from '../src/lib/crm/insights/scheduler.mjs';

const token = 'dedicated-insights-scheduler-token-must-not-leak';
const providerToken = 'fixture-insights-provider-token-must-not-leak';
const baseEnv = { CRM_META_INSIGHTS_SCHEDULER_TOKEN: token, CRM_INTAKE_SCHEDULER_TOKEN: 'intake-token', CRM_META_INSIGHTS_TOKEN_FIXTURE: providerToken };
const openEnv = { ...baseEnv, CRM_META_INSIGHTS_LIVE_ENABLED: 'true' };
const request = authorization => new Request('https://admin.example/api/cron/crm-insights', { headers: authorization ? { authorization } : {} });
const config = { mode: 'live', account_id: '1100', currency: 'USD', timezone: 'Africa/Casablanca', api_version: 'v99.0', secret_ref: 'CRM_META_INSIGHTS_TOKEN_FIXTURE' };
const row = { account_id: '1100', campaign_id: '1101', adset_id: '1102', ad_id: '1103', ad_name: 'Fixture', date_start: '2026-01-01', date_stop: '2026-01-01', spend: '12.5', impressions: '90', reach: '80', clicks: '4', inline_link_clicks: '2', actions: [] };
const respond = data => new Response(JSON.stringify(data), { status: 200 });
const graph = async (url, options) => {
  const u = new URL(url);
  assert.equal(u.host, 'graph.facebook.com'); assert.equal(options.headers.Authorization, `Bearer ${providerToken}`); assert(!url.includes(providerToken));
  if (u.pathname.endsWith('/act_1100')) return respond({ account_id: '1100', currency: 'USD', timezone_name: 'Africa/Casablanca' });
  if (/\/(campaigns|adsets|ads)$/.test(u.pathname)) return respond({ data: [] });
  return respond({ data: [row] });
};
const counts = body => Object.keys(body).sort().join(',');
const countKeys = 'completed,deferred,enqueued,failed,ok,processed';
let checks = 0;

// A queue stub with SKIP LOCKED semantics: a claimed run is invisible to other claims.
function queue(size, { enqueued = 0 } = {}) {
  const pending = Array.from({ length: size }, (_, i) => ({ id: `run-${i}`, lease_token: `lease-${i}`, date_from: '2026-01-01', date_to: '2026-01-01', attempt_count: 1, config }));
  const log = [];
  const rpc = async (name, args) => {
    log.push(name);
    await new Promise(resolve => setImmediate(resolve));
    if (name === 'crm_enqueue_insights_refresh') return enqueued;
    if (name === 'crm_claim_insights_sync') return pending.shift() || null;
    if (name === 'crm_finish_insights_sync') { assert.equal(args.p_data.currency, 'USD'); return null; }
    if (name === 'crm_fail_insights_sync') return null;
    throw new Error(`unexpected ${name}`);
  };
  return { rpc, log };
}

// 1. Authentication happens before anything else; other secrets never authorize.
const guarded = { env: openEnv, liveGate: true, rpc: async () => assert.fail('RPC before authorization'), fetchImpl: async () => assert.fail('fetch before authorization') };
for (const authorization of [undefined, 'Bearer wrong', 'Bearer intake-token', `Bearer ${providerToken}`, token, `bearer ${token}`]) {
  const result = await runScheduledInsights(request(authorization), guarded);
  assert.equal(result.status, 401); assert.deepEqual(await result.json(), { error: 'Unauthorized' }); assert.equal(result.headers.get('cache-control'), 'no-store'); checks++;
}
const noServerToken = await runScheduledInsights(request(`Bearer ${token}`), { ...guarded, env: { CRM_META_INSIGHTS_LIVE_ENABLED: 'true' } });
assert.equal(noServerToken.status, 401); checks++;

// 2. Closed server gate: authenticated counts-only answer; no enqueue, claim or fetch.
for (const [liveGate, env] of [[false, openEnv], [true, baseEnv], [true, { ...baseEnv, CRM_META_INSIGHTS_LIVE_ENABLED: 'TRUE' }]]) {
  const result = await runScheduledInsights(request(`Bearer ${token}`), { env, liveGate, rpc: async name => assert.fail(`closed gate called ${name}`), fetchImpl: async () => assert.fail('closed gate fetched') });
  assert.equal(result.status, 200); const body = await result.json();
  assert.deepEqual(body, { ok: true, enqueued: 0, processed: 0, completed: 0, failed: 0, deferred: 0 }); checks++;
}

// 3. Open gate: enqueue once, at most five runs per tick, counts only.
{
  const { rpc, log } = queue(8, { enqueued: 1 });
  const result = await runScheduledInsights(request(`Bearer ${token}`), { env: openEnv, liveGate: true, rpc, fetchImpl: graph });
  assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
  const text = await result.clone().text(); const body = await result.json();
  assert.equal(counts(body), countKeys); assert.deepEqual(body, { ok: true, enqueued: 1, processed: 5, completed: 5, failed: 0, deferred: 0 });
  assert.equal(log.filter(name => name === 'crm_enqueue_insights_refresh').length, 1); assert.equal(log.filter(name => name === 'crm_claim_insights_sync').length, 5);
  for (const secret of [token, providerToken, 'CRM_META_INSIGHTS_TOKEN', 'access_token', 'run-', 'lease-', '1100']) assert(!text.includes(secret), `response leaks ${secret}`);
  checks += 3;
}

// 4. Claim budget: no claim with fewer than 45 s left, so no attempt is spent on a tick's own deadline.
{
  const { rpc, log } = queue(3);
  let clock = 1_000_000; const now = () => { const value = clock; clock += 10_001; return value; };
  const body = await (await runScheduledInsights(request(`Bearer ${token}`), { env: openEnv, liveGate: true, rpc, fetchImpl: graph, now })).json();
  assert.deepEqual(body, { ok: true, enqueued: 0, processed: 0, completed: 0, failed: 0, deferred: 0 });
  assert.equal(log.filter(name => name === 'crm_claim_insights_sync').length, 0, 'no claim when the budget is spent'); checks++;
}
{
  // A first run lasting 11 s leaves under 45 s: exactly one run this tick.
  const { rpc, log } = queue(3);
  const ticks = [0, 0, 11_000]; let index = 0; const start = Date.now();
  const now = () => start + ticks[Math.min(index++, ticks.length - 1)];
  const body = await (await runScheduledInsights(request(`Bearer ${token}`), { env: openEnv, liveGate: true, rpc, fetchImpl: graph, now })).json();
  assert.equal(body.processed, 1); assert.equal(log.filter(name => name === 'crm_claim_insights_sync').length, 1); checks++;
}
{
  // The fetch deadline is the tick deadline minus a 5 s publish margin.
  const expired = queue(1);
  const late = await (await runScheduledInsights(request(`Bearer ${token}`), { env: openEnv, liveGate: true, rpc: expired.rpc, fetchImpl: graph, now: () => Date.now() - 50_001 })).json();
  assert.deepEqual([late.processed, late.deferred, late.completed], [1, 1, 0], 'fetch refused inside the publish margin');
  assert(expired.log.includes('crm_fail_insights_sync') && !expired.log.includes('crm_finish_insights_sync'));
  const inTime = queue(1);
  const ok = await (await runScheduledInsights(request(`Bearer ${token}`), { env: openEnv, liveGate: true, rpc: inTime.rpc, fetchImpl: graph, now: () => Date.now() - 48_000 })).json();
  assert.equal(ok.completed, 1); checks += 2;
}

// 5. Failure classes and a storage failure: counts or a generic 503, never details.
{
  const pending = [{ id: 'a', lease_token: 'l', date_from: '2026-01-01', date_to: '2026-01-01', attempt_count: 3, config }, { id: 'b', lease_token: 'l', date_from: '2026-01-01', date_to: '2026-01-01', attempt_count: 1, config }];
  const rpc = async name => name === 'crm_claim_insights_sync' ? pending.shift() || null : name === 'crm_enqueue_insights_refresh' ? 0 : null;
  const body = await (await runScheduledInsights(request(`Bearer ${token}`), { env: openEnv, liveGate: true, rpc, fetchImpl: async () => new Response('{}', { status: 500 }) })).json();
  assert.deepEqual(body, { ok: true, enqueued: 0, processed: 2, completed: 0, failed: 1, deferred: 1 });
  const broken = await runScheduledInsights(request(`Bearer ${token}`), { env: openEnv, liveGate: true, rpc: async () => { throw new Error(`storage ${token} ${providerToken}`); }, fetchImpl: graph });
  assert.equal(broken.status, 503); const text = await broken.text(); assert.deepEqual(JSON.parse(text), { error: 'Worker unavailable' });
  assert(!text.includes(token) && !text.includes(providerToken)); checks += 2;
}

// 6. Two concurrent ticks finalise a single queued run exactly once.
{
  const { rpc, log } = queue(1);
  const bodies = await Promise.all([0, 1].map(async () => (await runScheduledInsights(request(`Bearer ${token}`), { env: openEnv, liveGate: true, rpc, fetchImpl: graph })).json()));
  assert.equal(bodies.reduce((sum, body) => sum + body.completed, 0), 1);
  assert.equal(log.filter(name => name === 'crm_finish_insights_sync').length, 1); checks++;
}

// 7. The route wires the dedicated bearer, the server gate and the platform fetch.
const route = readFileSync(new URL('../src/app/api/cron/crm-insights/route.js', import.meta.url), 'utf8');
assert.match(route, /^import 'server-only';/); assert.match(route, /runtime = 'nodejs'/); assert.match(route, /maxDuration = 60/);
assert.match(route, /liveGate: insightsLiveEnabled\(process\.env\)/); assert.match(route, /fetchImpl: fetch/);
const server = readFileSync(new URL('../src/lib/crm/insights/server.js', import.meta.url), 'utf8');
assert.match(server, /^import 'server-only';/); assert.match(server, /env\.CRM_META_INSIGHTS_LIVE_ENABLED === 'true'/);
checks++;

console.log(`PASS Insights scheduler bearer, live gate, 45 s claim budget, 5-run bound, publish margin, counts-only responses and single finalisation (${checks} checks)`);

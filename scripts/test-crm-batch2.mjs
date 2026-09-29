import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateLifecycleEvidence, processLifecycleEvidence } from '../src/lib/crm/lifecycle/evidence.mjs';
import { prepareLifecyclePayload, postLifecycleLive } from '../src/lib/crm/lifecycle/adapter.mjs';
import { processLifecycleDeliveries } from '../src/lib/crm/lifecycle/worker.mjs';
import { runScheduledLifecycle } from '../src/lib/crm/lifecycle/scheduler.mjs';
import { isDirectorLifecyclePath, loginDestination } from '../src/lib/roleAccess.mjs';

const answer = (key, value) => ({ key, label: key, value, value_type: typeof value, label_source: 'provider' });
const candidate = {
  submission_id: '00000000-0000-4000-8000-000000000001', policy_id: '00000000-0000-4000-8000-000000000002',
  adult_field_key: 'adult_confirmed', adult_accepted_values: ['yes'], sharing_field_key: 'meta_share', sharing_accepted_values: ['yes'],
  notice_field_key: 'notice_version', notice_accepted_values: ['notice-v1'],
  answers: [answer('adult_confirmed', 'yes'), answer('meta_share', 'yes'), answer('notice_version', 'notice-v1')],
};
assert.deepEqual(evaluateLifecycleEvidence(candidate).eligible, true);
assert.equal(evaluateLifecycleEvidence({ ...candidate, answers: candidate.answers.filter(a => a.key !== 'adult_confirmed') }).reason, 'adult_missing');
assert.equal(evaluateLifecycleEvidence({ ...candidate, answers: [...candidate.answers, answer('adult_confirmed', 'yes')] }).reason, 'adult_ambiguous');
assert.equal(evaluateLifecycleEvidence({ ...candidate, answers: candidate.answers.map(a => a.key === 'meta_share' ? answer(a.key, 'no') : a) }).reason, 'sharing_missing');
assert.equal(evaluateLifecycleEvidence({ ...candidate, answers: candidate.answers.map(a => a.key === 'notice_version' ? answer(a.key, 'notice-v2') : a) }).reason, 'notice_mismatch');

const liveMapping = {
  mode: 'live', api_version: 'v42.0', dataset_id: '123456', secret_ref: 'CRM_META_LIFECYCLE_TOKEN_TEST',
  events: { qualified: 'VerifiedQualifiedFixture', converted: 'VerifiedConvertedFixture' }, action_source: 'system_generated',
  accepted_response_field: 'events_received', accepted_response_count: 1,
};
const delivery = { mapping: liveMapping, matching: { lead_id: '987654', adult_contact: true }, event_kind: 'qualified', event_id: 'eh:fixture:destination', event_time: 1700000000 };
const payload = prepareLifecyclePayload(delivery);
assert.deepEqual(payload.data[0].user_data, { lead_id: '987654' });
assert(!JSON.stringify(payload).match(/value|currency|email|phone|learner|child/i));
assert.throws(() => prepareLifecyclePayload({ ...delivery, matching: { adult_contact: true, email: 'adult@example.invalid' } }), /invalid_identity/);

let request;
const accepted = await postLifecycleLive({ mapping: liveMapping, payload, token: 'fixture-secret', fetchImpl: async (url, options) => {
  request = { url, options };
  return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'safe_trace' }), { status: 200, headers: { 'content-type': 'application/json' } });
} });
assert.equal(request.url, 'https://graph.facebook.com/v42.0/123456/events');
assert.equal(request.options.redirect, 'error');
assert.equal(request.options.cache, 'no-store');
assert.equal(request.options.headers.Authorization, 'Bearer fixture-secret');
assert.deepEqual(accepted, { http_status: 200, outcome: 'sent', request_id: 'safe_trace' });
for (const [status, body, outcome, code] of [[429, {}, 'retry', 'rate_limit'], [401, {}, 'blocked', 'provider_auth'], [503, {}, 'retry', 'provider_unavailable'], [400, { error: { code: 999 } }, 'dead', 'validation']]) {
  const result = await postLifecycleLive({ mapping: liveMapping, payload, token: 'fixture-secret', fetchImpl: async () => new Response(JSON.stringify(body), { status }) });
  assert.equal(result.outcome, outcome); assert.equal(result.error_code, code);
}

const evidenceCalls = [];
const evidenceResult = await processLifecycleEvidence({ rpc: async (name, args) => {
  evidenceCalls.push([name, args]);
  if (name === 'crm_claim_lifecycle_evidence') return [candidate];
  if (name === 'crm_record_lifecycle_evidence_check') return { eligible: args.p_eligible };
  throw new Error(name);
} });
assert.deepEqual(evidenceResult, { evaluated: 1, granted: 1, denied: 0 });
assert.equal(evidenceCalls[1][1].p_reason, 'eligible');
assert.match(evidenceCalls[1][1].p_digest, /^[a-f0-9]{64}$/);

assert.deepEqual(await processLifecycleDeliveries({ rpc: async () => { throw new Error('must not claim'); }, env: { CRM_META_LIFECYCLE_LIVE_ENABLED: 'false' }, fetchImpl: fetch, liveGate: false }), []);

const deliveryCalls = [];
let claimCount = 0;
let startChecks = 0;
const liveResults = await processLifecycleDeliveries({
  env: { CRM_META_LIFECYCLE_LIVE_ENABLED: 'true', CRM_META_LIFECYCLE_TOKEN_TEST: 'fixture-secret' },
  liveGate: true,
  limit: 3,
  canStart: () => ++startChecks === 1,
  fetchImpl: async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
  rpc: async (name, args) => {
    deliveryCalls.push([name, args]);
    if (name === 'crm_claim_external_deliveries') return claimCount++ === 0 ? [{ id: 'delivery-1', lease_token: 'lease-1' }] : [];
    if (name === 'crm_get_external_delivery') return delivery;
    if (name === 'crm_prepare_external_delivery') {
      assert.deepEqual(args.p_payload.data[0].user_data, { lead_id: '987654' });
      return 'a'.repeat(64);
    }
    if (name === 'crm_begin_external_attempt') return 1;
    if (name === 'crm_finish_external_attempt') { assert.equal(args.p_result.outcome, 'sent'); return null; }
    throw new Error(name);
  },
});
assert.deepEqual(liveResults, [{ status: 'sent' }]);
assert.equal(deliveryCalls.filter(([name]) => name === 'crm_claim_external_deliveries').length, 1);
assert.deepEqual(deliveryCalls[0][1], { p_limit: 1, p_allow_live: true });
assert.equal(startChecks, 2, 'deadline gate is checked before every possible claim');

const schedulerToken = 'lifecycle-scheduler-fixture';
const schedulerRequest = authorization => new Request('https://admin.example/api/cron/crm-lifecycle', { headers: authorization ? { authorization } : {} });
let schedulerCalls = [];
const schedulerRpc = async (name, args) => {
  schedulerCalls.push([name, args]);
  if (name === 'crm_claim_lifecycle_evidence') return [];
  if (name === 'crm_reconcile_external_deliveries') return 2;
  if (name === 'crm_cleanup_lifecycle_retention') return { payloads_erased: 0 };
  if (name === 'crm_record_lifecycle_scheduler_run') return null;
  throw new Error(name);
};
const unauthorized = await runScheduledLifecycle(schedulerRequest(), { env: {}, rpc: schedulerRpc, fetchImpl: fetch, liveGate: false });
assert.equal(unauthorized.status, 401); assert.equal(schedulerCalls.length, 0);
const scheduled = await runScheduledLifecycle(schedulerRequest(`Bearer ${schedulerToken}`), { env: { CRM_META_LIFECYCLE_SCHEDULER_TOKEN: schedulerToken, CRM_META_LIFECYCLE_LIVE_ENABLED: 'false' }, rpc: schedulerRpc, fetchImpl: fetch, liveGate: false });
assert.equal(scheduled.status, 200);
const scheduledBody = await scheduled.json();
assert.equal(scheduledBody.reconciled, 2); assert.equal(scheduledBody.processed, 0);
assert(!JSON.stringify(scheduledBody).includes(schedulerToken));

assert.equal(isDirectorLifecyclePath('/crm/integrations/lifecycle'), true);
for (const role of ['admin','receptionist','teacher','parent','student']) assert.equal(loginDestination(role, '/crm/integrations/lifecycle'), role === 'receptionist' ? '/crm/today' : ({ admin: '/dashboard', teacher: '/teacher-portal', parent: '/parent-portal', student: '/student-portal' })[role]);

const migration98 = readFileSync(new URL('../supabase/migrations/098_crm_lifecycle_evidence_and_delivery.sql', import.meta.url), 'utf8');
const migration99 = readFileSync(new URL('../supabase/migrations/099_crm_lifecycle_delivery_runtime.sql', import.meta.url), 'utf8');
const migration100 = readFileSync(new URL('../supabase/migrations/100_crm_lifecycle_scheduler.sql', import.meta.url), 'utf8');
assert(!/insert\s+into\s+public\.crm_lifecycle_provider_contracts/i.test(migration98));
assert.match(migration99, /deduplication_window_elapsed/);
assert.match(migration99, /diagnostics_erased_at=clock_timestamp\(\)/);
assert.match(migration99, /not c\.eligible and c\.redacted_at is null/);
assert.match(migration100, /crm-lifecycle-primary/);
assert.match(migration100, /cron\.alter_job\(lifecycle_job, active => false\)/);
assert.match(migration100, /crm_lifecycle_scheduler_(url|token)/);
assert.match(migration100, /https:\/\/admin\.english-hills\.com\/api\/cron\/crm-lifecycle/);
assert(!migration100.includes('crm_intake_scheduler_token'));

console.log('PASS Batch 2 explicit evidence, lead-ID-only payload, live transport classification, independent scheduler auth, route gate and fail-closed migrations');

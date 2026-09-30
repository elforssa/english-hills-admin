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
  events: { intake: 'Intake', not_qualified: 'Not qualified', lost: 'Lost', qualified: 'Qualified', converted: 'Converted' }, action_source: 'system_generated',
  accepted_response_field: 'events_received', accepted_response_count: 1, lifecycle_model: 'r4_stage_entry', uncertainty_policy: 'no_uncertain_replay',
  required_constants: { event_source: 'crm', lead_event_source: 'English Hills CRM' }, maximum_event_age_seconds: 604800,
};
const eventTime = Math.floor(Date.now() / 1000) - 10;
const delivery = { mapping: liveMapping, matching: { lead_id: '98765432109876543210987654321012', adult_contact: true }, event_kind: 'qualified', event_id: 'eh:fixture:destination', event_time: eventTime, source_generated_time: eventTime - 1 };
const payload = prepareLifecyclePayload(delivery);
assert.deepEqual(payload.data[0].user_data, { lead_id: '98765432109876543210987654321012' });
assert.deepEqual(payload.data[0].custom_data, { event_source: 'crm', lead_event_source: 'English Hills CRM' });
assert(!JSON.stringify(payload).match(/value|currency|email|phone|learner|child/i));
assert.throws(() => prepareLifecyclePayload({ ...delivery, matching: { adult_contact: true, email: 'adult@example.invalid' } }), /invalid_identity/);
assert.throws(() => prepareLifecyclePayload({ ...delivery, mapping: { ...liveMapping, action_source: 'phone_call' } }), /configuration_missing/);
assert.throws(() => prepareLifecyclePayload({ ...delivery, mapping: { ...liveMapping, maximum_event_age_seconds: 604801 } }), /configuration_missing/);
assert.throws(() => prepareLifecyclePayload({ ...delivery, mapping: { ...liveMapping, events: { ...liveMapping.events, qualified: 'QualifiedAlias' } } }), /configuration_missing/);

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
for (const [status, body, outcome, code] of [[429, {}, 'unknown', 'rate_limit'], [401, {}, 'blocked', 'provider_auth'], [503, {}, 'unknown', 'provider_unavailable'], [400, { error: { code: 999 } }, 'dead', 'validation']]) {
  const result = await postLifecycleLive({ mapping: liveMapping, payload, token: 'fixture-secret', fetchImpl: async () => new Response(JSON.stringify(body), { status }) });
  assert.equal(result.outcome, outcome); assert.equal(result.error_code, code);
}
const contradictorySuccess = await postLifecycleLive({ mapping: liveMapping, payload, token: 'fixture-secret',
  fetchImpl: async () => new Response(JSON.stringify({ events_received: 1, error: { code: 190, message: 'contradictory fixture' } }), { status: 200 }) });
assert.deepEqual(contradictorySuccess, { http_status: 200, outcome: 'unknown', error_code: 'malformed_response' });

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
      assert.deepEqual(args.p_payload.data[0].user_data, { lead_id: '98765432109876543210987654321012' });
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

let uncertainClaims = 0; let uncertainHttpCalls = 0; let uncertainFinishCalls = 0;
const uncertainRpc = async (name, args) => {
  if (name === 'crm_claim_external_deliveries') return uncertainClaims++ === 0 ? [{ id: 'uncertain-delivery', lease_token: 'uncertain-lease' }] : [];
  if (name === 'crm_get_external_delivery') return delivery;
  if (name === 'crm_prepare_external_delivery') return 'b'.repeat(64);
  if (name === 'crm_begin_external_attempt') return 1;
  if (name === 'crm_finish_external_attempt') { uncertainFinishCalls += 1; assert.equal(args.p_result.outcome, 'unknown'); return null; }
  throw new Error(name);
};
const uncertainOptions = { rpc: uncertainRpc, env: { CRM_META_LIFECYCLE_LIVE_ENABLED: 'true', CRM_META_LIFECYCLE_TOKEN_TEST: 'fixture-secret' }, liveGate: true,
  fetchImpl: async () => { uncertainHttpCalls += 1; throw new Error('socket closed after possible dispatch'); } };
assert.deepEqual(await processLifecycleDeliveries(uncertainOptions), [{ status: 'unknown' }]);
assert.deepEqual(await processLifecycleDeliveries(uncertainOptions), []);
assert.equal(uncertainHttpCalls, 1, 'a potentially dispatched event identity is called exactly once');
assert.equal(uncertainFinishCalls, 1);

let finalizeLossClaims = 0; let finalizeLossHttpCalls = 0;
const finalizeLossOptions = {
  env: { CRM_META_LIFECYCLE_LIVE_ENABLED: 'true', CRM_META_LIFECYCLE_TOKEN_TEST: 'fixture-secret' }, liveGate: true,
  fetchImpl: async () => { finalizeLossHttpCalls += 1; return Response.json({ events_received: 1 }); },
  rpc: async (name) => {
    if (name === 'crm_claim_external_deliveries') return finalizeLossClaims++ === 0 ? [{ id: 'finalize-loss', lease_token: 'finalize-loss-lease' }] : [];
    if (name === 'crm_get_external_delivery') return delivery;
    if (name === 'crm_prepare_external_delivery') return 'c'.repeat(64);
    if (name === 'crm_begin_external_attempt') return 1;
    if (name === 'crm_finish_external_attempt') throw new Error('finalize acknowledgement lost after provider success');
    throw new Error(name);
  },
};
assert.deepEqual(await processLifecycleDeliveries(finalizeLossOptions), [{ status: 'unknown' }]);
assert.deepEqual(await processLifecycleDeliveries(finalizeLossOptions), []);
assert.equal(finalizeLossHttpCalls, 1, 'provider success followed by finalize loss is not sent again');

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
const migration101 = readFileSync(new URL('../supabase/migrations/101_crm_meta_funnel_r4_schema_controls.sql', import.meta.url), 'utf8');
const migration102 = readFileSync(new URL('../supabase/migrations/102_crm_meta_funnel_r4_runtime_safety.sql', import.meta.url), 'utf8');
const lifecycleUi = readFileSync(new URL('../src/components/crm/LifecycleOperations.jsx', import.meta.url), 'utf8');
assert(!/insert\s+into\s+public\.crm_lifecycle_provider_contracts/i.test(migration98));
assert.match(migration99, /deduplication_window_elapsed/);
assert.match(migration99, /diagnostics_erased_at=clock_timestamp\(\)/);
assert.match(migration99, /not c\.eligible and c\.redacted_at is null/);
assert.match(migration100, /crm-lifecycle-primary/);
assert.match(migration100, /cron\.alter_job\(lifecycle_job, active => false\)/);
assert.match(migration100, /crm_lifecycle_scheduler_(url|token)/);
assert.match(migration100, /https:\/\/admin\.english-hills\.com\/api\/cron\/crm-lifecycle/);
assert(!migration100.includes('crm_intake_scheduler_token'));
assert(!/insert\s+into\s+public\.crm_lifecycle_provider_contracts/i.test(migration101 + migration102));
assert.match(migration101, /crm_lifecycle_producer_boundaries/);
assert.match(migration101, /crm_lifecycle_producer_ownership/);
assert.match(migration102, /Potentially dispatched delivery cannot be replayed/);
assert.match(migration102, /lease_expired_after_dispatch/);
assert.match(migration102, /unattempted_predecessor/);
assert.match(migration102, /English Hills CRM/);
for (const label of ['Réception','Non qualifié','Perdu','Qualifié','Converti']) assert(lifecycleUi.includes(label));

console.log('PASS Batch 2 explicit evidence, lead-ID-only payload, live transport classification, independent scheduler auth, route gate and fail-closed migrations');

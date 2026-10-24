import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runScheduledIntake } from '../src/lib/crm/intake/scheduler.mjs';

const workflow = readFileSync(new URL('../.github/workflows/crm-intake-scheduler.yml', import.meta.url), 'utf8');
assert.match(workflow, /^name: CRM Intake Scheduler$/m);
assert.match(workflow, /Backup trigger/);
assert.match(workflow, /Supabase pg_cron is the primary five-minute scheduler/);
assert.match(workflow, /cron: '2-57\/5 \* \* \* \*'/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /secrets\.CRM_INTAKE_SCHEDULER_TOKEN/);
assert.match(workflow, /https:\/\/admin\.english-hills\.com\/api\/cron\/crm-intake/);
assert(!/--fail\b/.test(workflow), 'the script branches on the status itself');
assert.match(workflow, /\|\| rc=\$\?/);
assert.match(workflow, /424\) echo 'CRM intake reported a lead-intake problem\. Open Analyse marketing > Réception des leads\.'/);
assert.match(workflow, /--output \/dev\/null/);
assert.match(workflow, /--write-out '%\{http_code\}'/);
assert.match(workflow, /2\?\?\) ;;/);
assert(!workflow.includes('CRM_META_WORKER_TOKEN'));

const token = 'dedicated-scheduler-test-token-that-must-not-leak';
const workerToken = 'existing-worker-token-must-not-authorize-scheduler';
const env = {
  CRM_INTAKE_SCHEDULER_TOKEN: token,
  CRM_META_WORKER_TOKEN: workerToken,
};
const request = authorization => new Request('https://admin.example/api/cron/crm-intake', {
  headers: authorization ? { authorization } : {},
});

let calls = 0;
let discoveryCalls = 0;
const idleDiscovery = { forms: 0, discovered: 0, enqueued: 0, failed: 0 };
const idleReconcile = { ...idleDiscovery, code: null };
const guardedDependencies = {
  env,
  rpc: async () => { throw new Error('RPC must not run before authorization'); },
  fetchImpl: async () => { throw new Error('Fetch must not run before authorization'); },
  processJobs: async () => { calls += 1; return []; },
  reconcile: async () => { discoveryCalls += 1; return idleReconcile; },
};

for (const authorization of [undefined, 'Bearer invalid', `Bearer ${workerToken}`]) {
  const result = await runScheduledIntake(request(authorization), guardedDependencies);
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: 'Unauthorized' });
}
const missingServerSecret = await runScheduledIntake(request(`Bearer ${token}`), {
  ...guardedDependencies,
  env: { CRM_META_WORKER_TOKEN: workerToken },
});
assert.equal(missingServerSecret.status, 401);
assert.deepEqual(await missingServerSecret.json(), { error: 'Unauthorized' });
assert.equal(calls, 0);
assert.equal(discoveryCalls, 0);

let received;
const invoked = await runScheduledIntake(request(`Bearer ${token}`), {
  ...guardedDependencies,
  processJobs: async options => {
    calls += 1;
    received = options;
    return [{ id: 'not-returned', status: 'done' }, { id: 'also-hidden', error_code: 'storage_unavailable' }];
  },
});
assert.equal(invoked.status, 200);
assert.equal(calls, 1);
assert.equal(received.limit, 3);
assert.equal(received.env, env);
const invokedBody = await invoked.json();
assert.deepEqual(invokedBody, { ok: true, processed: 2, succeeded: 1, failed: 1, reconciliation: idleDiscovery });
let boundedWorkerLimit;
const discoveryRun = await runScheduledIntake(request(`Bearer ${token}`), {
  ...guardedDependencies,
  reconcile: async () => ({ forms: 1, discovered: 50, enqueued: 50, failed: 0, code: null }),
  processJobs: async options => { boundedWorkerLimit = options.limit; return []; },
});
assert.equal(boundedWorkerLimit, 2);
assert.equal((await discoveryRun.json()).reconciliation.enqueued, 50);

const failed = await runScheduledIntake(request(`Bearer ${token}`), {
  ...guardedDependencies,
  processJobs: async () => { throw new Error(`sensitive ${token}`); },
});
assert.equal(failed.status, 503);
const failedBody = await failed.json();
assert.deepEqual(failedBody, { error: 'Worker unavailable' });

for (const [result, body] of [[invoked, invokedBody], [failed, failedBody]]) {
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert(!JSON.stringify(body).includes(token));
  assert(!JSON.stringify(body).includes(workerToken));
}

let claimed = false;
let finalizations = 0;
const lease = 'exclusive-lease';
const rpc = async (name, args) => {
  if (name === 'crm_claim_ingestion_jobs') {
    assert.deepEqual(args, { p_limit: 3, p_provider: null });
    if (claimed) return [];
    claimed = true;
    return [{
      id: 'job',
      lease_token: lease,
      connection: { provider: 'website' },
      payload: { form_key: 'annual', contact: { name: 'Synthetic' }, answers: {} },
    }];
  }
  if (name === 'crm_get_website_job_mapping') {
    assert.equal(args.p_lease, lease);
    return { id: 'mapping', field_map: {}, question_labels: {}, default_program_interest_text: 'Annual' };
  }
  if (name === 'crm_finalize_website_job') {
    assert.equal(args.p_lease, lease);
    finalizations += 1;
    return { status: 'done' };
  }
  throw new Error(`Unexpected RPC: ${name}`);
};

const duplicateResults = await Promise.all([
  runScheduledIntake(request(`Bearer ${token}`), { env, rpc, fetchImpl: fetch, reconcile: async () => idleReconcile }),
  runScheduledIntake(request(`Bearer ${token}`), { env, rpc, fetchImpl: fetch, reconcile: async () => idleReconcile }),
]);
assert.deepEqual(duplicateResults.map(result => result.status), [200, 200]);
assert.equal(finalizations, 1);
assert.deepEqual(
  await Promise.all(duplicateResults.map(result => result.json())),
  [
    { ok: true, processed: 1, succeeded: 1, failed: 0, reconciliation: idleDiscovery },
    { ok: true, processed: 0, succeeded: 0, failed: 0, reconciliation: idleDiscovery },
  ],
);

// P1-A: 424 only for a real poll failure or a blocked/dead job outcome; the code never leaves the server.
const ALERT_KEYS = ['alert', 'failed', 'ok', 'processed', 'reconciliation', 'succeeded'];
const RECONCILIATION_KEYS = ['discovered', 'enqueued', 'failed', 'forms'];
const intake = (reconcile, outcomes = []) => runScheduledIntake(request(`Bearer ${token}`), {
  env, rpc: async () => { throw new Error('unused'); }, fetchImpl: fetch, reconcile, processJobs: async () => outcomes,
});
const pollFailure = code => async () => ({ forms: 1, discovered: 0, enqueued: 0, failed: 1, code });
async function expectAlert(result, reconciliation) {
  assert.equal(result.status, 424);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const body = await result.json();
  assert.deepEqual(Object.keys(body).sort(), ALERT_KEYS);
  assert.deepEqual(Object.keys(body.reconciliation).sort(), RECONCILIATION_KEYS);
  assert.equal(body.ok, false);
  assert.equal(body.alert, true);
  if (reconciliation) assert.deepEqual(body.reconciliation, reconciliation);
  assert(!/code|provider_auth|missing_|rate_limit|storage_unavailable|invalid_|connection_disabled|attempts_exhausted/.test(JSON.stringify(body)));
  return body;
}
async function expectOk(result) {
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(Object.keys(body).sort(), ['failed', 'ok', 'processed', 'reconciliation', 'succeeded']);
  assert.deepEqual(Object.keys(body.reconciliation).sort(), RECONCILIATION_KEYS);
  assert.equal(body.ok, true);
  assert(!('alert' in body));
  return body;
}
for (const code of ['provider_auth', 'missing_secret', 'rate_limit', 'storage_unavailable', 'invalid_provider_data',
  'provider_unavailable', 'timeout', 'network']) {
  await expectAlert(await intake(pollFailure(code)), { forms: 1, discovered: 0, enqueued: 0, failed: 1 });
}
const thrown = await expectAlert(await intake(async () => { throw new Error(`sensitive ${token}`); }),
  { forms: 0, discovered: 0, enqueued: 0, failed: 1 });
assert(!JSON.stringify(thrown).includes(token));
for (const code of ['reconciliation_lease_lost', 'reconciliation_disabled', 'reconciliation_form_inactive']) {
  assert.deepEqual(await expectOk(await intake(pollFailure(code))),
    { ok: true, processed: 0, succeeded: 0, failed: 0, reconciliation: { forms: 1, discovered: 0, enqueued: 0, failed: 1 } });
}
for (const code of ['missing_secret', 'provider_auth', 'missing_mapping', 'missing_policy', 'connection_disabled',
  'invalid_provider_data', 'invalid_mapping', 'attempts_exhausted']) {
  const body = await expectAlert(await intake(async () => idleReconcile, [{ id: 'job', error_code: code }, { id: 'ok', status: 'done' }]));
  assert.deepEqual({ ...body, reconciliation: undefined }, { ok: false, alert: true, processed: 2, succeeded: 1, failed: 1, reconciliation: undefined });
}
const blocked = await expectAlert(await intake(async () => idleReconcile, [{ id: 'job', status: 'blocked' }]));
assert.equal(blocked.succeeded, 1);
for (const code of ['timeout', 'rate_limit', 'provider_unavailable', 'network', 'storage_unavailable']) {
  await expectOk(await intake(async () => idleReconcile, [{ id: 'job', error_code: code }]));
}
await expectOk(await intake(async () => idleReconcile, [{ id: 'job', status: 'done' }, { id: 'dup', status: 'duplicate' }]));
const alertNotRetried = await intake(pollFailure('provider_auth'));
assert.equal(alertNotRetried.status, 424, 'curl --retry retries 408/429/5xx only');
const alertFailedWorker = await runScheduledIntake(request(`Bearer ${token}`), {
  env, rpc: async () => { throw new Error('unused'); }, fetchImpl: fetch,
  reconcile: pollFailure('provider_auth'), processJobs: async () => { throw new Error('down'); },
});
assert.equal(alertFailedWorker.status, 503);
assert.deepEqual(await alertFailedWorker.json(), { error: 'Worker unavailable' });

console.log('PASS 424 alert rule: non-benign poll codes, thrown reconcile, blocked/ALERT_JOB outcomes; benign codes and retry outcomes stay 200; counts-only bodies');
console.log('PASS backup GitHub scheduler, shared authentication, bounded diagnostics, worker invocation and lease-safe duplicate triggers');

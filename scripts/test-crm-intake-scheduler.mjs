import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runScheduledIntake } from '../src/lib/crm/intake/scheduler.mjs';

const workflow = readFileSync(new URL('../.github/workflows/crm-intake-scheduler.yml', import.meta.url), 'utf8');
assert.match(workflow, /^name: CRM Intake Scheduler$/m);
assert.match(workflow, /cron: '2-57\/5 \* \* \* \*'/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /secrets\.CRM_INTAKE_SCHEDULER_TOKEN/);
assert.match(workflow, /https:\/\/admin\.english-hills\.com\/api\/cron\/crm-intake/);
assert.match(workflow, /--fail/);
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
const guardedDependencies = {
  env,
  rpc: async () => { throw new Error('RPC must not run before authorization'); },
  fetchImpl: async () => { throw new Error('Fetch must not run before authorization'); },
  processJobs: async () => { calls += 1; return []; },
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
assert.deepEqual(invokedBody, { ok: true, processed: 2, succeeded: 1, failed: 1 });

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
  runScheduledIntake(request(`Bearer ${token}`), { env, rpc, fetchImpl: fetch }),
  runScheduledIntake(request(`Bearer ${token}`), { env, rpc, fetchImpl: fetch }),
]);
assert.deepEqual(duplicateResults.map(result => result.status), [200, 200]);
assert.equal(finalizations, 1);
assert.deepEqual(
  await Promise.all(duplicateResults.map(result => result.json())),
  [
    { ok: true, processed: 1, succeeded: 1, failed: 0 },
    { ok: true, processed: 0, succeeded: 0, failed: 0 },
  ],
);

console.log('PASS GitHub CRM scheduler configuration, dedicated authentication, bounded diagnostics, worker invocation and lease-safe duplicates');

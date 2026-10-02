import assert from 'node:assert/strict';
import { loadMetaRpc } from './lib/load-meta-rpc-fixture.mjs';
import { MetaError, metaRpcError } from '../src/lib/crm/meta/protocol.mjs';
import { reconcileMetaLeads } from '../src/lib/crm/meta/reconcile.mjs';
import { runScheduledIntake } from '../src/lib/crm/intake/scheduler.mjs';

const metaRpc = await loadMetaRpc(null);
const enqueue = 'crm_enqueue_meta_reconciled', finish = 'crm_finish_meta_reconciliation';
for (const name of [enqueue, finish, 'crm_claim_meta_reconciliation', 'crm_finalize_meta_job']) {
  for (const code of ['PT409', '40001', '23505', '23503', '22023', undefined]) {
    for (const message of ['crm_reconciliation_lease_lost', 'crm_reconciliation_disabled',
      'crm_reconciliation_form_inactive', 'crm_reconciliation_lease_lost suffix', 'unknown']) {
      const wire = { code, message, status: 409, details: 'sensitive-details', hint: 'sensitive-hint' };
      let expected = code === '22023' ? 'invalid_provider_data' : 'storage_unavailable';
      if (code === 'PT409' && [enqueue, finish].includes(name) && message === 'crm_reconciliation_lease_lost') expected = 'reconciliation_lease_lost';
      if (code === 'PT409' && name === enqueue && ['crm_reconciliation_disabled', 'crm_reconciliation_form_inactive'].includes(message)) expected = message.slice(4);
      globalThis.__repairClient = { rpc: async () => ({ error: wire }) };
      await assert.rejects(metaRpc(name, {}), e => e.code === expected && e.message === expected && !('details' in e) && !('hint' in e));
      assert.equal(metaRpcError(name, wire).code, expected);
    }
  }
}
for (const code of ['23514', '22007', '22008', '23502']) assert.equal(metaRpcError(enqueue, { code }).code, 'invalid_provider_data');
globalThis.__repairClient = { rpc: async () => { throw new Error('network'); } };
await assert.rejects(metaRpc(enqueue), /network/);
delete globalThis.__repairClient;

const form = { connection_id: 'synthetic', form_key: '31', page_id: '41', api_version: 'v26.0',
  access_token_secret_ref: 'CRM_META_PAGE_TOKEN_TEST', started_at: new Date(Date.now() - 600000).toISOString(),
  lookback_minutes: 60, lease_token: 'synthetic-lease' };
const env = { CRM_META_PAGE_TOKEN_TEST: 'fake', CRM_INTAKE_SCHEDULER_TOKEN: 'fake-scheduler' };
const lead = i => ({ id: String(100 + i), form_id: '31', created_time: new Date(Date.now() - 60000 - i * 1000).toISOString() });
async function run({ losePage, enqueueError, finishError, fetchError, timeout, status, missingSecret, data } = {}) {
  const calls = []; let pages = 0, batches = 0;
  const rpc = async (name, args) => {
    calls.push([name, args]);
    if (name === 'crm_claim_meta_reconciliation') return form;
    if (name === enqueue) {
      batches++;
      if (batches === losePage) throw new MetaError('reconciliation_lease_lost');
      if (enqueueError) throw enqueueError;
      return { enqueued: args.p_events.length - 1, existing: 1 };
    }
    if (name === finish) { if (finishError) throw finishError; return; }
    throw new Error('unexpected RPC');
  };
  const fetchImpl = async (_url, options) => {
    pages++;
    if (timeout) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    if (fetchError) throw fetchError;
    return Response.json(status ? { error: { code: status === 401 ? 190 : 613 } }
      : { data: data || Array.from({ length: 25 }, (_, i) => lead((pages - 1) * 25 + i)), paging: { cursors: { after: `cursor${pages}` } } }, { status: status || 200 });
  };
  const result = await reconcileMetaLeads({ rpc, fetchImpl, env: missingSecret ? {} : env });
  assert.equal(calls.filter(([n]) => n === 'crm_claim_meta_reconciliation').length, 1);
  return { result, calls, pages, rpc, fetchImpl };
}
for (const losePage of [1, 2]) {
  const r = await run({ losePage });
  assert.deepEqual(r.result, { forms: 1, discovered: (losePage - 1) * 25, enqueued: (losePage - 1) * 24, failed: 1 });
  assert.equal(r.pages, losePage); assert.equal(r.calls.filter(([n]) => n === finish).length, 0);
}
for (const reason of ['reconciliation_disabled', 'reconciliation_form_inactive', 'storage_unavailable']) {
  for (const loseFinish of [false, true]) {
    const r = await run({ enqueueError: new MetaError(reason), finishError: loseFinish ? new MetaError('reconciliation_lease_lost') : undefined });
    assert.equal(r.pages, 1); assert.equal(r.result.failed, 1);
    assert.deepEqual(r.calls.filter(([n]) => n === finish).map(([, a]) => a.p_error), [reason]);
  }
}
for (const enqueueError of [new Error('RPC/network rejection'), { code: 'reconciliation_lease_lost' }]) {
  const r = await run({ enqueueError }); assert.equal(r.calls.at(-1)[1].p_error, 'storage_unavailable');
}
for (const finishError of [new MetaError('reconciliation_lease_lost'), new Error('storage')]) {
  const r = await run({ finishError }); assert.deepEqual(r.result, { forms: 1, discovered: 50, enqueued: 48, failed: 1 });
  assert.equal(r.calls.filter(([n]) => n === finish).length, 1);
}
for (const [options, reason] of [[{ status: 401 }, 'provider_auth'], [{ status: 429 }, 'rate_limit'],
  [{ status: 503 }, 'provider_unavailable'], [{ fetchError: new Error('network') }, 'network'],
  [{ timeout: true }, 'timeout'],
  [{ missingSecret: true }, 'missing_secret'], [{ data: [lead(2), lead(1)] }, 'invalid_provider_data']]) {
  const r = await run({ ...options, finishError: new MetaError('reconciliation_lease_lost') });
  assert.equal(r.calls.at(-1)[1].p_error, reason); assert.equal(r.result.failed, 1);
  assert.equal(r.calls.filter(([n]) => n === finish).length, 1);
}
let limit;
const response = await runScheduledIntake(new Request('http://local.test', { headers: { authorization: 'Bearer fake-scheduler' } }), {
  env, reconcile: async () => (await run({ losePage: 2 })).result,
  processJobs: async o => { limit = o.limit; return [{ status: 'done' }]; },
});
assert.equal(limit, 2); assert.equal((await response.json()).processed, 1);
console.log('PASS exact server classifier, first/second-page loss, committed counts, single finish, provider/storage isolation and continued intake');

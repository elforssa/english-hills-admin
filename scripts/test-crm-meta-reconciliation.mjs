import assert from 'node:assert/strict';
import { reconcileMetaLeads } from '../src/lib/crm/meta/reconcile.mjs';
import { normalizeForm } from '../src/lib/crm/intake/form.mjs';

const now = Date.now();
const iso = offset => new Date(now + offset * 60000).toISOString();
const lead = (id, offset = -2, form = '31') => ({ id, created_time: iso(offset), form_id: form,
  ad_id: '7', field_data: [{ name: 'travel', values: ["oui,_c'est_proche_de_chez_moi"] }] });
const form = (key = '31') => ({ connection_id: 'fake-uuid', form_key: key, page_id: '41', api_version: 'v26.0',
  access_token_secret_ref: 'CRM_META_PAGE_TOKEN_TEST', started_at: iso(-20), lookback_minutes: 60, lease_token: 'lease' });
const env = { CRM_META_PAGE_TOKEN_TEST: 'synthetic-token' };
function harness({ forms = [form()], pages = [[lead('51')]], status = 200 } = {}) {
  let graphCalls = 0, cursorSeen = [], failures = [], leases = [...forms], jobs = new Map(), activeForm;
  const rpc = async (name, args) => {
    if (name === 'crm_claim_meta_reconciliation') {
      const claimed = leases.shift() || null;
      activeForm = claimed?.form_key;
      return claimed;
    }
    if (name === 'crm_enqueue_meta_reconciled') {
      let enqueued = 0;
      for (const event of args.p_events) { const key = `${event.page_id}:${event.leadgen_id}`; if (!jobs.has(key)) { jobs.set(key, event); enqueued++; } }
      return { enqueued, existing: args.p_events.length - enqueued };
    }
    if (name === 'crm_finish_meta_reconciliation') { failures.push(args.p_error); return; }
    throw new Error(name);
  };
  const fetchImpl = async (url, options) => {
    graphCalls++;
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.equal(url.host, 'graph.facebook.com');
    if (activeForm === '31') assert.equal(url.pathname, '/v26.0/31/leads');
    else assert.equal(url.pathname, `/v26.0/${activeForm}/leads`);
    assert.equal(url.searchParams.get('fields'), 'id,created_time,form_id,ad_id,field_data');
    assert.equal(url.searchParams.get('limit'), '25');
    cursorSeen.push(url.searchParams.get('after'));
    return Response.json(status === 200 ? { data: pages[graphCalls - 1] || [], paging: { cursors: { after: graphCalls === 1 ? 'cursor+/=' : `cursor${graphCalls}` } } } : { error: { code: 613 } }, { status });
  };
  return { rpc, fetchImpl, get graphCalls() { return graphCalls; }, cursorSeen, failures, jobs };
}
let h = harness();
assert.deepEqual(await reconcileMetaLeads({ ...h, env }), { forms: 1, discovered: 1, enqueued: 1, failed: 0 });
assert.equal(h.jobs.size, 1);
assert.equal(h.graphCalls, 1);
h = harness({ forms: [form(), form()] });
await reconcileMetaLeads({ ...h, env });
assert.equal((await reconcileMetaLeads({ ...h, env })).enqueued, 0);
assert.equal(h.jobs.size, 1);
h = harness({ forms: [] });
assert.equal((await reconcileMetaLeads({ ...h, env })).forms, 0);
assert.equal(h.graphCalls, 0);
h = harness({ pages: [[lead('52', -30)]] });
assert.equal((await reconcileMetaLeads({ ...h, env })).discovered, 0);
assert.equal(h.jobs.size, 0);
h = harness({ pages: [Array.from({ length: 25 }, (_, i) => lead(String(100 + i), -1 - i / 100)), [lead('200', -2)]] });
assert.equal((await reconcileMetaLeads({ ...h, env })).discovered, 26);
assert.deepEqual(h.cursorSeen, [null, 'cursor+/=']);
assert.equal(h.graphCalls, 2);
h = harness({ status: 429 });
assert.equal((await reconcileMetaLeads({ ...h, env })).failed, 1);
assert.deepEqual(h.failures, ['rate_limit']);
h = harness({ status: 503 });
assert.equal((await reconcileMetaLeads({ ...h, env })).failed, 1);
assert.deepEqual(h.failures, ['provider_unavailable']);
h = harness({ pages: [[lead('invalid')]] });
assert.equal((await reconcileMetaLeads({ ...h, env })).failed, 1);
assert.equal(h.jobs.size, 0);
h = harness({ forms: [form('31'), form('32')], pages: [[lead('51', -2, 'wrong')], [lead('52', -2, '32')]] });
assert.equal((await reconcileMetaLeads({ ...h, env })).failed, 1);
assert.equal((await reconcileMetaLeads({ ...h, env })).enqueued, 1);
const normalized = normalizeForm([
  { name: 'travel', values: ["oui,_c'est_proche_de_chez_moi"] },
  { name: 'age', values: ['7-8'] },
  { name: 'other_question', values: ['arbitrary'] },
], { field_map: { learner_age: 'age' }, question_labels: { travel: 'Distance' },
  option_labels: { travel: { "oui,_c'est_proche_de_chez_moi": "Oui, c'est proche de chez moi" } } });
assert.equal(normalized.form_answers[0].value, "oui,_c'est_proche_de_chez_moi");
assert.equal(normalized.form_answers[0].display_value, "Oui, c'est proche de chez moi");
assert.equal(normalized.form_answers[1].value, '7-8');
assert.equal(normalized.form_answers[2].value, 'arbitrary');
assert.equal(normalized.core_fields.learner_age, null);
console.log('PASS bounded Meta discovery, watermark, pagination, rate limits, failure isolation and option labels');

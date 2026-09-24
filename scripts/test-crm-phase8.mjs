import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { webhookGet, webhookPost, MetaError } from '../src/lib/crm/meta/protocol.mjs';
import { graphGet, retrieveLead, normalizeLead } from '../src/lib/crm/meta/adapter.mjs';
import { processMetaJobs } from '../src/lib/crm/meta/worker.mjs';
const secret = 'synthetic-app-secret';
const callback = { object: 'page', entry: [{ id: '1', changes: [{ field: 'leadgen', value: { page_id: '1', leadgen_id: '2', form_id: '3', created_time: 1700000000 } }] }] };
const request = (body, signature = true) => new Request('http://localhost/api/webhooks/meta/leads', { method: 'POST', body,
  headers: signature ? { 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` } : {} });
let stored = 0;
const persist = async events => { stored += events.length; };
assert.equal((await webhookGet(new Request('http://localhost/?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=123'), 'verify')).status, 200);
assert.equal((await webhookGet(new Request('http://localhost/?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123'), 'verify')).status, 403);
assert.equal((await webhookGet(new Request('http://localhost/?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=%3Cscript%3E'), 'verify')).status, 400);
for (const [body, signature, expected] of [[JSON.stringify(callback), true, 200], [JSON.stringify(callback), false, 403], ['{', true, 400], ['x'.repeat(131073), true, 413], ['{"object":"user","entry":[]}', true, 400]]) {
 assert.equal((await webhookPost(request(body, signature), { appSecret: secret, persist })).status, expected);
}
assert.equal(stored, 1);
assert.equal((await webhookPost(request(JSON.stringify(callback)), { appSecret: 'wrong', persist })).status, 403);
assert.equal((await webhookPost(request(JSON.stringify(callback)), { appSecret: secret, persist: async () => { throw Error('sensitive database error'); } })).status, 503);
const job = { id: 'job', lease_token: 'lease', payload: { page_id: '1', leadgen_id: '2', form_id: '3' }, connection: { api_version: 'v99.0', access_token_secret_ref: 'CRM_META_PAGE_TOKEN_TEST' } };
const lead = { id: '2', form_id: '3', ad_id: '4', created_time: '2026-09-01T10:00:00Z', field_data: [
 { name: 'parent', values: ['Sara'] }, { name: 'phone', values: ['0612345678'] }, { name: 'child', values: ['Adam'] },
 { name: 'age', values: [12] }, { name: 'consent', values: [true] }, { name: 'days', values: ['lundi', 'mardi'] },
 { name: 'campaign_id', values: ['SECRET-ID'] }] };
const mapping = { id: 'mapping', field_map: { contact_name: 'parent', phone: 'phone', learner_name: 'child', learner_age: 'age' },
 question_labels: { parent: 'Parent', days: 'Jours préférés' }, form_name: 'Rentrée', default_program_interest_text: 'Annual English', default_session_type: 'Yearly' };
const fetchSuccess = async (url, options) => {
 assert.equal(url.hostname, 'graph.facebook.com'); assert(!url.searchParams.has('access_token'));assert.equal(options.headers.Authorization, 'Bearer fake-token');
 return Response.json(url.pathname.endsWith('/2') ? lead : { id: '4', name: 'Ad snapshot', campaign: { id: '5', name: 'Campaign snapshot' }, adset: { id: '6', name: 'Adset snapshot' } });
};
const retrieved = await retrieveLead(job, 'fake-token', fetchSuccess);
const normalized = normalizeLead(job, retrieved, mapping);
assert.equal(normalized.core_fields.learner_age, 12);assert.equal(normalized.core_fields.program_interest_text, 'Annual English');
assert.equal(normalized.attribution.attribution_status, 'complete');
assert(!normalized.form_answers.some(a => a.key === 'campaign_id'));
assert(!JSON.stringify(normalized.attribution.raw_payload).includes('SECRET-ID'));
assert.deepEqual(normalized.form_answers.find(a => a.key === 'days').value, ['lundi', 'mardi']);
assert.equal(normalized.form_answers.find(a => a.key === 'consent').value_type, 'boolean');
const other = normalizeLead(job, { lead: { ...lead, field_data: [{ name: 'guardian_name', values: ['Other guardian'] }] } }, { ...mapping, field_map: { contact_name: 'guardian_name' }, default_program_interest_text: 'Summer' });
assert.equal(other.core_fields.contact_name, 'Other guardian');assert.equal(other.core_fields.learner_name, null);assert.equal(other.core_fields.program_interest_text, 'Summer');
assert.throws(() => normalizeLead(job, retrieved, null), e => e.code === 'missing_mapping');
for (const [status, payload, code] of [[429, {}, 'rate_limit'], [500, {}, 'provider_unavailable'], [401, {}, 'provider_auth'], [400, { error: { code: 190, message: 'SECRET' } }, 'provider_auth'], [200, null, 'invalid_provider_data']]) {
 await assert.rejects(graphGet({ apiVersion: 'v99.0', token: 'fake', id: '2', fields: 'id', fetchImpl: async () => Response.json(payload, { status }) }), e => e.code === code && !e.message.includes('SECRET'));
}
await assert.rejects(graphGet({ apiVersion: 'v99.0', token: 'fake', id: '2', fields: 'id', fetchImpl: async () => { throw Error('network with secret'); } }), e => e.code === 'network');
const partial = await retrieveLead(job, 'fake-token', async url => url.pathname.endsWith('/2') ? Response.json(lead) : Response.json({}, { status: 403 }));
assert.equal(normalizeLead(job, partial, mapping).attribution.attribution_status, 'partial');
let finalized = 0, failures = [];
const rpc = async (name, args) => {
 if (name === 'crm_claim_meta_jobs') return [job];
 if (name === 'crm_get_meta_job_mapping') return mapping;
 if (name === 'crm_finalize_meta_job') { finalized++;assert.equal(args.p_lease, 'lease');return { status: 'done' }; }
 if (name === 'crm_fail_meta_job') { failures.push(args.p_code);return null; }
 throw Error(name);
};
await processMetaJobs({ rpc, env: { CRM_META_PAGE_TOKEN_TEST: 'fake-token' }, fetchImpl: fetchSuccess });assert.equal(finalized, 1);
await processMetaJobs({ rpc, env: {} });assert.deepEqual(failures, ['missing_secret']);
await processMetaJobs({ rpc, env: { CRM_META_PAGE_TOKEN_TEST: 'fake-token' }, fetchImpl: async () => Response.json({}, { status: 429 }) });assert.equal(failures.at(-1), 'rate_limit');
assert.equal(finalized, 1);
await assert.rejects(graphGet({ apiVersion: 'v99.0', token: 'fake', id: '2', fields: 'id', fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))) }), e => e.code === 'timeout');
await assert.rejects(retrieveLead(job, 'fake-token', async () => Response.json({ id: 'wrong', form_id: '3', field_data: [] })), e => e.code === 'invalid_provider_data');
await assert.rejects(graphGet({ apiVersion: 'v99.0', token: 'fake', id: '2', fields: 'id', fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.error(Error('network interrupted')); } })) }), e => e.code === 'network');
assert(new MetaError('timeout').message === 'timeout');
console.log('PASS Phase 8 webhook/provider/mapping/worker fixtures');

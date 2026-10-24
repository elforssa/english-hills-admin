// LOCAL synthetic acceptance for the director lead-intake panel (LIR-r1 P1-B): the
// panel's helpers against the real director RPCs over PostgREST with signed-in
// synthetic users, and the real intake worker/reconciler with a stubbed Graph API.
// Run after `supabase db reset --local --no-seed`. Never reads .env.local or accepts
// a database/HTTP URL from the environment.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadMetaRpc } from './lib/load-meta-rpc-fixture.mjs';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { processExternalJobs } from '../src/lib/crm/intake/worker.mjs';
import { reconcileMetaLeads } from '../src/lib/crm/meta/reconcile.mjs';
import {
  DIAGNOSTICS_PAGE, buildPublishPayload, canRetry, defaultEffectiveFrom, groupMetaForms, jobsToHandle, metaConnection,
  retirePlan, rpcErrorMessage,
} from '../src/lib/crm/intakeAdmin.mjs';

assertLocalFeatureBranch();
const processEnv = { ...process.env, PGPASSWORD: 'postgres', SUPABASE_TELEMETRY_DISABLED: '1', DISABLE_EXTERNAL_EMAIL: 'true' };
const pgArgs = ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const sql = s => execFileSync('psql', pgArgs, { input: s, encoding: 'utf8', env: processEnv, timeout: 15000 }).trim();
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', env: processEnv, stdio: ['ignore', 'pipe', 'ignore'] }));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
assert.equal(sql('select count(*) from crm_integration_connections') + sql('select count(*) from crm_followup_policies'), '00', 'fresh local reset required');
assert.equal(sql("select count(*) from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token')"), '0', 'no job-kick HTTP call configured');

const local = (url, options) => { assert.equal(new URL(url).origin, status.API_URL); return fetch(url, options); };
const clientFor = bearer => createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false },
  db: { retry: false }, global: { fetch: local, headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} } });
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false }, global: { fetch: local } });
const workerRpc = await loadMetaRpc({ rpc: (name, a) => service.rpc(name, a).abortSignal(AbortSignal.timeout(5000)) });

const password = randomBytes(20).toString('hex');
const users = {};
for (const role of ['director', 'admin', 'receptionist']) {
  const email = `lir-${role}-${randomUUID()}@example.invalid`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  sql(`update profiles set role='${role}' where id='${created.data.user.id}'`);
  const session = await clientFor().auth.signInWithPassword({ email, password });
  assert.ifError(session.error);
  users[role] = { id: created.data.user.id, client: clientFor(session.data.session.access_token) };
}
const anon = clientFor();
async function call(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}
const director = (name, args) => call(users.director.client, name, args);
async function refused(client, name, args, code = '42501') {
  await assert.rejects(call(client, name, args), error => error.code === code, `${name} expected ${code}`);
}

// Fixture: a Meta connection polled by reconciliation only (webhook off, as in
// Production), a website site, and the follow-up policy every finalizer needs.
const started = new Date(Date.now() - 60 * 86400000).toISOString();
const page = '96001', formA = '96002', formB = '96003';
const allWeek = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [['00:00', '23:59']]]));
await director('crm_create_followup_policy', { p_request_key: randomUUID(), p_data: { weekly_hours: allWeek } });
sql(`insert into crm_integration_connections(provider,connection_key,page_id,api_version,access_token_secret_ref,settings,created_by,updated_by)
 values('meta','lir-meta','${page}','v26.0','CRM_META_PAGE_TOKEN_LIR',jsonb_build_object('meta_reconciliation',jsonb_build_object('enabled',true,'started_at','${started}','lookback_minutes',1440)),'${users.director.id}','${users.director.id}')`);
const site = await director('crm_save_website_connection', { p_data: { connection_key: 'lir-site', origin: 'https://school.example' } });
await director('crm_save_website_connection', { p_data: { connection_key: 'lir-site', origin: 'https://school.example', enabled: true }, p_id: site.id, p_version: site.version });

let diagnostics = await director('crm_get_meta_diagnostics', DIAGNOSTICS_PAGE);
const connection = metaConnection(diagnostics.connections);
assert.equal(connection.provider, 'meta');
assert.equal(connection.connection_key, 'lir-meta');
const forms = async () => groupMetaForms((await director('crm_get_meta_diagnostics', DIAGNOSTICS_PAGE)).mappings, connection.id);
const formState = async key => (await forms()).find(f => f.form_key === key);

// Graph stub: a lead per id; form leads listed newest first.
const env = { CRM_META_PAGE_TOKEN_LIR: 'synthetic-token' };
const leads = new Map(), graphPaths = [];
const lead = (id, form, created) => leads.set(id, { id, form_id: form, created_time: new Date(created).toISOString(),
  field_data: [{ name: 'full_name', values: [`Parent ${id}`] }, { name: 'phone_number', values: ['0612345678'] }] });
const fetchImpl = async url => {
  const { pathname } = new URL(url);
  graphPaths.push(pathname);
  const [, , id, edge] = pathname.split('/');
  if (edge === 'leads') return Response.json({ data: [...leads.values()].filter(l => l.form_id === id).sort((a, b) => b.created_time.localeCompare(a.created_time)), paging: {} });
  return leads.has(id) ? Response.json(leads.get(id)) : Response.json({ error: { code: 100 } }, { status: 400 });
};
const work = () => processExternalJobs({ rpc: workerRpc, env, fetchImpl, limit: 10 });
const job = key => JSON.parse(sql(`select coalesce((select to_jsonb(j) from crm_ingestion_jobs j where external_key='${key}'),'null')`));
const submissions = key => Number(sql(`select count(*) from crm_submissions s join crm_ingestion_jobs j on j.submission_id=s.id where j.external_key='${key}'`));
// Every form the claim would poll right now; leases are released afterwards.
function claimable() {
  const keys = [];
  for (;;) {
    const claimed = sql(`begin;set local request.jwt.claim.role='service_role';select crm_claim_meta_reconciliation()->>'form_key';commit;`);
    if (!claimed) break;
    keys.push(claimed);
  }
  sql('update crm_meta_reconciliation_state set lease_token=null,lease_until=null,next_due_at=now()');
  return keys.sort();
}
const insertJob = (leadgen, form, created) => sql(`insert into crm_ingestion_jobs(connection_id,external_key,event_kind,payload,payload_hash,status,reconciliation_started_at)
 select id,'${page}:${leadgen}','leadgen',p,encode(sha256(convert_to(p::text,'UTF8')),'hex'),'pending','${started}'::timestamptz
 from crm_integration_connections, jsonb_build_object('page_id','${page}','leadgen_id','${leadgen}','form_id','${form}','created_time',${Math.floor(created / 1000)}) p
 where connection_key='lir-meta'`);

// 1. A lead submitted two days before its form is published blocks on missing_mapping.
const early = Date.now() - 2 * 86400000;
lead('96101', formA, early);
insertJob('96101', formA, early);
let outcomes = await work();
assert.deepEqual(outcomes.map(o => o.error_code), ['missing_mapping']);
assert.deepEqual([job(`${page}:96101`).status, job(`${page}:96101`).last_error_code], ['blocked', 'missing_mapping']);
assert.deepEqual(claimable(), []);
diagnostics = await director('crm_get_meta_diagnostics', DIAGNOSTICS_PAGE);
const blocked = jobsToHandle(diagnostics.jobs);
assert.equal(blocked.length, 1);
assert(canRetry(blocked[0]));

// 2. Publishing the first version with the D4 default (−30 days) makes the claim
// include the form, and the retried job finalizes exactly once.
const published = buildPublishPayload(connection, { form_key: formA, form_name: 'LIR rentrée', field_map: { contact_name: 'full_name', phone: 'phone_number' },
  learner_policy: 'optional', default_session_type: 'Yearly', effective_from: defaultEffectiveFrom([]) }, []);
assert(!published.errors, published.errors);
const v1 = await director('crm_publish_meta_form_mapping', published);
assert.equal(v1.version, 1);
assert(Math.abs(Date.parse(v1.effective_from) - (Date.now() - 30 * 86400000)) < 120000);
assert.equal((await formState(formA)).status, 'active');
assert.deepEqual(claimable(), [formA]);
await director('crm_retry_meta_job', { p_job: blocked[0].id });
await refused(users.director.client, 'crm_retry_meta_job', { p_job: blocked[0].id }, '22023');
outcomes = await work();
assert.equal(outcomes.length, 1);
assert(!('error_code' in outcomes[0]), JSON.stringify(outcomes));
assert.equal(job(`${page}:96101`).status, 'done');
assert.deepEqual(await work(), []);
assert.equal(submissions(`${page}:96101`), 1);
assert.equal(sql(`select core_fields->>'contact_name' from crm_submissions s join crm_ingestion_jobs j on j.submission_id=s.id where j.external_key='${page}:96101'`), 'Parent 96101');
console.log('PASS back-dated first publication is claimed; the blocked missing_mapping job retried after it finalizes once');

// 3. A form with two unretired versions (Production's shape). Retiring only the
// latest leaves the form Active and claimed, and a new lead then blocks.
const second = { form_key: formB, field_map: { contact_name: 'full_name', phone: 'phone_number' } };
const b1 = await director('crm_publish_meta_form_mapping', buildPublishPayload(connection, { ...second, effective_from: new Date(Date.now() - 40 * 86400000).toISOString() }, []));
let stateB = await formState(formB);
const b2 = await director('crm_publish_meta_form_mapping', buildPublishPayload(connection, { ...second, effective_from: new Date(Date.now() - 5 * 86400000).toISOString() }, stateB.versions));
stateB = await formState(formB);
assert.deepEqual([stateB.status, stateB.partial, stateB.unretired.length], ['active', false, 2], 'publishing does not retire earlier versions');
assert.deepEqual(claimable(), [formA, formB]);
await director('crm_retire_meta_form_mapping', { p_mapping: b2.id });
stateB = await formState(formB);
assert.deepEqual([stateB.status, stateB.partial, stateB.unretired.map(v => v.id)], ['active', true, [b1.id]]);
assert.deepEqual(claimable(), [formA, formB], 'retiring one version keeps polling the form');
// A lead after that retirement: the newest effective version is retired for it.
lead('96201', formB, Date.parse(stateB.versions.find(v => v.id === b2.id).retired_at) + 1000);
graphPaths.length = 0;
for (let pass = 0; pass < 3 && !graphPaths.some(p => p.includes(`/${formB}/`)); pass += 1) {
  assert.equal((await reconcileMetaLeads({ rpc: workerRpc, env, fetchImpl })).code, null);
}
assert(graphPaths.some(p => p.includes(`/${formB}/leads`)), 'the partially retired form is still polled');
assert(job(`${page}:96201`), 'its new lead is enqueued');
outcomes = await work();
assert.deepEqual(outcomes.map(o => o.error_code), ['missing_mapping'], 'the regression: the newest version is retired, its leads block');
sql('update crm_meta_reconciliation_state set next_due_at=now()');

// 4. Arrêter l'import: every unretired version, one call each. No claim afterwards,
// and a new lead for the form creates no job at all.
for (const id of retirePlan(stateB)) await director('crm_retire_meta_form_mapping', { p_mapping: id });
stateB = await formState(formB);
assert.deepEqual([stateB.status, stateB.partial, stateB.unretired.length], ['stopped', false, 0]);
await refused(users.director.client, 'crm_retire_meta_form_mapping', { p_mapping: b1.id }, '22023');
assert.deepEqual(claimable(), [formA]);
lead('96202', formB, Date.now() - 30000);
const jobsBefore = sql('select count(*) from crm_ingestion_jobs');
graphPaths.length = 0;
for (let pass = 0; pass < 3; pass += 1) {
  await reconcileMetaLeads({ rpc: workerRpc, env, fetchImpl });
  sql('update crm_meta_reconciliation_state set next_due_at=now()');
}
assert(!graphPaths.some(p => p.includes(`/${formB}/`)), 'a stopped form is never polled');
assert.equal(sql('select count(*) from crm_ingestion_jobs'), jobsBefore);
assert.equal(job(`${page}:96202`), null);
console.log('PASS two unretired versions: retiring one keeps the form claimed (and its new lead blocks); Arrêter l’import retires both, no claim, no job');

// 5. A website inquiry for an unknown form key (D8 = B) is stored, blocks, and is
// imported once after the website mapping is published and the job retried.
const requestId = randomUUID();
const payload = { form_key: 'lir_campaign', contact: { name: 'Sara', phone: '0612345678' }, answers: { child: 'Adam' }, attribution: {}, consent: true };
await call(service, 'crm_accept_website_inquiry', { p_site: 'lir-site', p_form: 'lir_campaign', p_request: requestId, p_payload: payload });
const websiteKey = `lir_campaign:${requestId}`;
outcomes = await work();
assert.deepEqual(outcomes.map(o => o.error_code), ['missing_mapping']);
assert.deepEqual([job(websiteKey).status, job(websiteKey).last_error_code], ['blocked', 'missing_mapping']);
await director('crm_publish_website_form_mapping', { p_connection: site.id, p_data: { form_key: 'lir_campaign', form_name: 'Campagne', field_map: { learner_name: 'child' },
  default_session_type: 'Yearly', effective_from: '2020-01-01T00:00:00Z' } });
const websiteJob = jobsToHandle((await director('crm_get_meta_diagnostics', DIAGNOSTICS_PAGE)).jobs).find(j => j.id === job(websiteKey).id);
assert(canRetry(websiteJob));
await director('crm_retry_meta_job', { p_job: websiteJob.id });
outcomes = await work();
assert.equal(outcomes.length, 1);
assert(!('error_code' in outcomes[0]), JSON.stringify(outcomes));
assert.equal(job(websiteKey).status, 'done');
assert.deepEqual(await work(), []);
assert.equal(submissions(websiteKey), 1);
console.log('PASS blocked website job retried after its website mapping is published finalizes once');

// 6. Only the director: receptionist, admin and anon are refused by every panel RPC.
const someMapping = (await formState(formA)).latest.id;
const panelCalls = [
  ['crm_get_meta_diagnostics', DIAGNOSTICS_PAGE],
  ['crm_publish_meta_form_mapping', buildPublishPayload(connection, { form_key: '96009', effective_from: defaultEffectiveFrom([]) }, [])],
  ['crm_retire_meta_form_mapping', { p_mapping: someMapping }],
  ['crm_retry_meta_job', { p_job: websiteJob.id }],
];
for (const client of [users.receptionist.client, users.admin.client, anon]) {
  for (const [name, args] of panelCalls) await refused(client, name, args);
}
assert.equal((await formState(formA)).status, 'active', 'refused calls changed nothing');
assert.equal(await formState('96009'), undefined);
assert.equal(rpcErrorMessage({ code: '42501' }), 'Réservé à la direction');
console.log('PASS receptionist, admin and anon refused (42501) by diagnostics, publish, retire and retry');

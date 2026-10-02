// Destructive LOCAL synthetic acceptance: fresh replay, 104 upgrade, real PostgREST.
// Never reads .env.local or accepts a database/HTTP URL from the environment.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadMetaRpc } from './lib/load-meta-rpc-fixture.mjs';
import { MetaError, metaRpcError } from '../src/lib/crm/meta/protocol.mjs';
import { reconcileMetaLeads } from '../src/lib/crm/meta/reconcile.mjs';
import { reconcileMetaLeads as oldWorker } from './fixtures/meta-reconcile-104.mjs';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';

assertLocalFeatureBranch();
const processEnv = { ...process.env, PGPASSWORD: 'postgres', SUPABASE_TELEMETRY_DISABLED: '1', DISABLE_EXTERNAL_EMAIL: 'true' };
const pgArgs = ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const sql = s => execFileSync('psql', pgArgs, { input: s, encoding: 'utf8', env: processEnv, timeout: 15000 }).trim();
const cli = args => execFileSync('supabase', args, { encoding: 'utf8', env: processEnv, timeout: 240000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const q = s => `'${String(s).replaceAll("'", "''")}'`;
const workerSQL = s => sql(`begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';${s};commit;`);
const enqueue = 'crm_enqueue_meta_reconciled', finish = 'crm_finish_meta_reconciliation';
const signatures = [enqueue + '(uuid,text,uuid,jsonb)', finish + '(uuid,text,uuid,text)'];
const director = '95000000-0000-0000-0000-000000000001', connection = '95000000-0000-0000-0000-000000000002';
const token = '95000000-0000-0000-0000-000000000003', stale = '95000000-0000-0000-0000-000000000004';
const migration = readFileSync('supabase/migrations/105_crm_meta_reconciliation_business_conflicts.sql', 'utf8');
const digest = createHash('sha256').update(migration).digest('hex');
const earlier = Array.from({ length: 104 }, (_, i) => String(i + 1).padStart(3, '0'));
const { readdirSync } = await import('node:fs');
const paths = readdirSync('supabase/migrations').filter(f => earlier.includes(f.slice(0, 3))).sort();
assert.equal(paths.length, 104);
const digests = () => paths.map(f => createHash('sha256').update(readFileSync(`supabase/migrations/${f}`)).digest('hex'));
const immutable = digests();
function setup() {
  sql(`insert into auth.users(id,email,aud,role) values('${director}','repair@example.invalid','authenticated','authenticated');
  update profiles set role='director' where id='${director}';
  insert into crm_integration_connections(id,connection_key,page_id,api_version,access_token_secret_ref,settings,created_by,updated_by)
  values('${connection}','repair-test','95001','v26.0','CRM_META_PAGE_TOKEN_TEST',jsonb_build_object('meta_reconciliation',jsonb_build_object('enabled',true,'started_at',now()-interval '10 minutes','lookback_minutes',60)),'${director}','${director}');
  insert into crm_form_mappings(connection_id,form_key,version,field_map,effective_from,created_by)
  select '${connection}',f,1,'{}','2020-01-01','${director}' from unnest(array['95002','95003','95004']) f;
  insert into crm_meta_reconciliation_state(connection_id,form_key,lease_token,lease_until)
  values('${connection}','95002','${token}',now()+interval '55 seconds'),('${connection}','95003','${stale}',now()-interval '1 second'),('${connection}','95004','${token}',now()+interval '55 seconds');
  insert into crm_ingestion_jobs(connection_id,external_key,event_kind,payload,payload_hash,status)
  values('${connection}','95001:95005','leadgen','{"page_id":"95001","form_id":"95002","leadgen_id":"95005","created_time":1700000000}',repeat('a',64),'blocked');`);
}
function inventory() {
  const tables = sql("select tablename from pg_tables where schemaname='public' order by tablename").split('\n');
  return Object.fromEntries(tables.map(t => [t, sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${t} t`)]));
}
const catalog = () => JSON.parse(sql(`select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'owner',p.proowner,'acl',p.proacl,'definer',p.prosecdef,'config',p.proconfig,'args',p.proargnames,'types',p.proargtypes::text,'defaults',p.proargdefaults::text,'return',p.prorettype,'body',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security') and p.prokind='f'`));
function state() { return sql(`select jsonb_agg(to_jsonb(s) order by form_key) from crm_meta_reconciliation_state s where connection_id='${connection}'`); }
const queue = () => sql(`select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]') from crm_ingestion_jobs j where connection_id='${connection}'`);
function owned(form = '95002') {
  sql(`update crm_meta_reconciliation_state set lease_token='${token}',lease_until=now()+interval '55 seconds',next_due_at=now() where connection_id='${connection}' and form_key='${form}'`);
}
function config(enabled) {
  sql(`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${director}';
  select crm_save_meta_connection(jsonb_build_object('connection_key',connection_key,'page_id',page_id,'api_version',api_version,'access_token_secret_ref',access_token_secret_ref,'meta_reconciliation',jsonb_build_object('enabled',${enabled},'lookback_minutes',60)),id,version) from crm_integration_connections where id='${connection}'`);
}
const args = (lease = stale, form = '95002') => ({ p_connection: connection, p_form: form, p_lease: lease });
const events = id => [{ page_id: '95001', form_id: '95002', leadgen_id: String(id), created_time: Math.ceil(Date.now() / 1000) }];
const statement = (name, a) => `select public.${name}(${q(a.p_connection)},${q(a.p_form)},${q(a.p_lease)},${name === enqueue ? q(JSON.stringify(a.p_events || [])) + '::jsonb' : a.p_error == null ? 'null' : q(a.p_error)})`;
function directConflict(name, a, message) {
  const before = [state(), queue()];
  workerSQL(`do $$begin begin ${statement(name, a).replace(/^select /, 'perform ')};exception when sqlstate 'PT409' then if sqlerrm=${q(message)} then return;end if;raise;end;raise exception 'conflict required';end$$`);
  assert.deepEqual([state(), queue()], before);
}

console.log('Starting fresh local 001→105 replay');
cli(['db', 'reset', '--local', '--no-seed']);
assert.equal(sql('select max(version::integer) from supabase_migrations.schema_migrations'), '105');
workerSQL(`do $$begin begin perform public.crm_finish_meta_reconciliation('${connection}','95002','${stale}',null);exception when sqlstate 'PT409' then if sqlerrm='crm_reconciliation_lease_lost' then return;end if;raise;end;raise exception 'expected conflict';end$$`);
sql(readFileSync('scripts/test-crm-meta-reconciliation.sql', 'utf8'));
console.log('PASS fresh 001→105 replay and historical reconciliation SQL on current schema');
cli(['db', 'reset', '--local', '--version', '104', '--no-seed']);
setup();
const beforeData = inventory(), beforeCatalog = catalog(), beforeCron = sql('select jsonb_agg(to_jsonb(j) order by jobid) from cron.job j');
cli(['migration', 'up', '--local']);
assert.deepEqual(inventory(), beforeData);
assert.equal(sql('select jsonb_agg(to_jsonb(j) order by jobid) from cron.job j'), beforeCron);
const afterCatalog = catalog();
assert.equal(beforeCatalog.length, afterCatalog.length);
let changed = 0;
for (let i = 0; i < beforeCatalog.length; i++) {
  const old = { ...beforeCatalog[i] }, current = { ...afterCatalog[i] };
  if (signatures.includes('' + old.name.replace('public.', ''))) {
    assert.notEqual(old.body, current.body); changed++;
    assert.equal(current.definer, true); assert.deepEqual(current.config, ['search_path=pg_catalog, pg_temp']);
    assert(!current.body.includes('40001'));
    delete old.body; delete current.body;
  }
  assert.deepEqual(current, old, old.name);
}
assert.equal(changed, 2); assert.deepEqual(digests(), immutable);
console.log('PASS stateful 104→105: all public data, scheduler, unrelated functions and all catalog security attributes unchanged');


const status = JSON.parse(cli(['status', '-o', 'json']));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
assert.equal(status.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
let outbound = 0;
const countedFetch = async (url, options) => { assert(new URL(url).origin === status.API_URL); outbound++; return fetch(url, options); };
const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false },
  db: { retry: false }, global: { fetch: countedFetch } });
const rpc = await loadMetaRpc({ rpc: (name, a) => client.rpc(name, a).abortSignal(AbortSignal.timeout(5000)) });
async function raw(name, a, bearer = status.SERVICE_ROLE_KEY) {
  const res = await countedFetch(`${status.API_URL}/rest/v1/rpc/${name}`, { method: 'POST',
    headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(a), signal: AbortSignal.timeout(5000) });
  return { status: res.status, body: await res.json() };
}
// Temporary nontransactional counters: sequences survive each exception rollback.
// No counter or instrumentation ships in migration 105. Restore exact bodies in finally.
const repaired = Object.fromEntries(signatures.map(sig => [sig, sql(`select pg_get_functiondef('public.${sig}'::regprocedure)`)]));
const probe = name => `crm_repair_${name === enqueue ? 'enqueue' : 'finish'}_probe`;
const counts = () => [enqueue, finish].map(n => Number(sql(`select case when is_called then last_value else 0 end from public.${probe(n)}`)));
const activity = () => Number(sql("select count(*) from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid() and state='active' and (query like '%crm_enqueue_meta_reconciled%' or query like '%crm_finish_meta_reconciliation%')"));
let maxMs = 0, conflicts = 0;
try {
  for (const name of [enqueue, finish]) {
    sql(`create sequence public.${probe(name)} cache 1`);
    const sig = signatures[name === enqueue ? 0 : 1];
    sql(repaired[sig].replace(/\bbegin\b/i, `begin perform nextval('public.${probe(name)}');`));
  }
  async function conflict(name, a, message) {
    if (name === enqueue) a = { p_events: events('95199'), ...a };
    directConflict(name, a, message);
    const before = [state(), queue()], beforeCount = counts(), beforeOutbound = outbound;
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      if (i < 5) {
        const res = await raw(name, a);
        assert.equal(res.status, 409); assert.deepEqual(res.body, { code: 'PT409', message, details: null, hint: null });
      } else {
        const res = await client.rpc(name, a).abortSignal(AbortSignal.timeout(5000));
        assert.equal(res.status, 409); assert.equal(res.error.code, 'PT409'); assert.equal(res.error.message, message);
        assert.equal(metaRpcError(name, res.error).code, message.slice(4));
      }
      const ms = performance.now() - start; maxMs = Math.max(ms, maxMs); assert(ms < 2000, `unexplained slow conflict ${ms}ms`); conflicts++;
    }
    assert.equal(outbound - beforeOutbound, 10);
    const delta = counts().map((v, i) => v - beforeCount[i]);
    assert.deepEqual(delta, name === enqueue ? [10, 0] : [0, 10], 'one backend execution per outbound RPC');
    assert.deepEqual([state(), queue()], before);
  }
  for (const name of [enqueue, finish]) {
    await conflict(name, { ...args(), p_connection: '95000000-0000-0000-0000-000000000099', ...(name === enqueue ? { p_events: [] } : {}) }, 'crm_reconciliation_lease_lost');
    await conflict(name, args(), 'crm_reconciliation_lease_lost');
    await conflict(name, args(stale, '95003'), 'crm_reconciliation_lease_lost');
  }
  // Replacement ownership obtained through the unchanged claim RPC.
  sql(`update crm_meta_reconciliation_state set next_due_at=now()+interval '1 day' where connection_id='${connection}';
    update crm_meta_reconciliation_state set next_due_at=now()-interval '1 minute',lease_until=now()-interval '1 second' where connection_id='${connection}' and form_key='95002'`);
  const replacement = JSON.parse(workerSQL('select crm_claim_meta_reconciliation()'));
  assert.notEqual(replacement.lease_token, token);
  for (const name of [enqueue, finish]) await conflict(name, args(token), 'crm_reconciliation_lease_lost');
  const replacedState = state();
  await Promise.all([raw(enqueue, { ...args(token), p_events: events('95100') }), raw(finish, args(token)),
    rpc(enqueue, { ...args(replacement.lease_token), p_events: events('95101') })]);
  assert.equal(state(), replacedState);
  await rpc(finish, args(replacement.lease_token));
  await conflict(finish, args(replacement.lease_token), 'crm_reconciliation_lease_lost');

  owned(); config(false);
  await conflict(enqueue, args(token), 'crm_reconciliation_disabled');
  await conflict(enqueue, args(stale), 'crm_reconciliation_lease_lost');
  await rpc(finish, { ...args(token), p_error: 'reconciliation_disabled' }); config(true);
  owned('95004');
  sql(`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${director}';select crm_retire_meta_form_mapping(id) from crm_form_mappings where connection_id='${connection}' and form_key='95004'`);
  await conflict(enqueue, args(token, '95004'), 'crm_reconciliation_form_inactive');
  await conflict(enqueue, args(stale, '95004'), 'crm_reconciliation_lease_lost');
  await rpc(finish, { ...args(token, '95004'), p_error: 'reconciliation_form_inactive' });

  // Atomic storage failure after the first batch row, preserving SQLSTATE over HTTP.
  owned();
  sql(`create function public.crm_repair_fail_write() returns trigger language plpgsql as $$begin if new.external_key='95001:95202' then raise exception 'synthetic_storage_failure' using errcode='XX001';end if;return new;end$$;
    create trigger crm_repair_fail_write before insert on crm_ingestion_jobs for each row execute function public.crm_repair_fail_write()`);
  try {
    const before = [state(), queue()];
    const r = await raw(enqueue, { ...args(token), p_events: [...events('95201'), ...events('95202')] });
    assert.equal(r.status, 500); assert.equal(r.body.code, 'XX001'); assert.equal(r.body.message, 'synthetic_storage_failure');
    assert.equal(metaRpcError(enqueue, r.body).code, 'storage_unavailable'); assert.deepEqual([state(), queue()], before);
    let storageFinishes = 0;
    const storageResult = await reconcileMetaLeads({ rpc: async (n, a) => {
      if (n === 'crm_claim_meta_reconciliation') return { connection_id: connection, form_key: '95002', page_id: '95001', api_version: 'v26.0',
        access_token_secret_ref: 'CRM_META_PAGE_TOKEN_TEST', started_at: new Date(Date.now()-60000).toISOString(), lookback_minutes: 60, lease_token: token };
      if (n === finish) { storageFinishes++; assert.equal(a.p_error, 'storage_unavailable'); }
      return rpc(n, a);
    }, env: { CRM_META_PAGE_TOKEN_TEST: 'fake' }, fetchImpl: async () => Response.json({ data:
      [...events('95201'), ...events('95202')].map(e => ({ id: e.leadgen_id, form_id: e.form_id, created_time: new Date(e.created_time*1000).toISOString() })) }) });
    assert.deepEqual(storageResult, { forms: 1, discovered: 0, enqueued: 0, failed: 1 });
    assert.equal(storageFinishes, 1); assert.equal(queue(), before[1]);
  } finally { sql('drop trigger crm_repair_fail_write on crm_ingestion_jobs;drop function public.crm_repair_fail_write()'); }

  // Old main worker + repaired SQL: generic storage path and at most one extra finish.
  for (const worker of [oldWorker, reconcileMetaLeads]) {
    let graph = 0, claims = 0, enqueues = 0, finishes = 0;
    owned();
    const passRpc = async (name, a) => {
      if (name === 'crm_claim_meta_reconciliation') { claims++; return { ...args(token), connection_id: connection, form_key: '95002', page_id: '95001', api_version: 'v26.0',
        access_token_secret_ref: 'CRM_META_PAGE_TOKEN_TEST', started_at: new Date(Date.now()-600000).toISOString(), lookback_minutes: 60, lease_token: token }; }
      if (name === enqueue) { enqueues++; sql(`update crm_meta_reconciliation_state set lease_token='${stale}' where connection_id='${connection}' and form_key='95002'`); }
      if (name === finish) { finishes++; assert.equal(a.p_error, 'storage_unavailable'); }
      const { data, error } = await client.rpc(name, a).abortSignal(AbortSignal.timeout(5000));
      if (error) throw worker === oldWorker ? new MetaError(['22023','23514','22007','22008','23502'].includes(error.code) ? 'invalid_provider_data' : 'storage_unavailable') : metaRpcError(name, error);
      return data;
    };
    const start = performance.now();
    const result = await worker({ rpc: passRpc, env: { CRM_META_PAGE_TOKEN_TEST: 'fake' }, fetchImpl: async () => {
      graph++; return Response.json({ data: events('95301').map(e=>({ id: e.leadgen_id, form_id: e.form_id, created_time: new Date(e.created_time*1000).toISOString() })) });
    } });
    assert.deepEqual(result, { forms: 1, discovered: 0, enqueued: 0, failed: 1 });
    assert.deepEqual([claims, graph, enqueues, finishes], [1, 1, 1, worker === oldWorker ? 1 : 0]);
    assert(performance.now()-start < 2000);
  }
  // Normal new worker uses the real repaired SQL; injected Graph only.
  owned(); let successfulFetches = 0;
  const normalForm = { connection_id: connection, form_key: '95002', page_id: '95001', api_version: 'v26.0', access_token_secret_ref: 'CRM_META_PAGE_TOKEN_TEST',
    started_at: new Date().toISOString(), lookback_minutes: 60, lease_token: token };
  const normal = await reconcileMetaLeads({ rpc: (n,a) => n==='crm_claim_meta_reconciliation' ? Promise.resolve(normalForm) : rpc(n,a), env: { CRM_META_PAGE_TOKEN_TEST: 'fake' }, fetchImpl: async () => {
    successfulFetches++; return Response.json({ data: events('95302').map(e=>({ id:e.leadgen_id,form_id:e.form_id,created_time:new Date(e.created_time*1000).toISOString() })) });
  } });
  assert.deepEqual(normal,{ forms:1,discovered:1,enqueued:1,failed:0 });assert.equal(successfulFetches,1);

  // Quiescence after all conflict responses, not just a rolled-back counter.
  const quietCount = counts(); const quietOutbound = outbound;
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.deepEqual(counts(), quietCount); assert.equal(activity(), 0); assert.equal(outbound, quietOutbound);
  }
  owned(); await rpc(enqueue, { ...args(token), p_events: [] }); await rpc(finish, args(token));
  console.log(`PASS HTTP ${conflicts} bounded conflicts (5 raw + 5 Supabase per case), max ${Math.ceil(maxMs)}ms <2000ms; exact invocation counts, 10s quiet period, successful RPC afterward; old/new worker compatibility`);
} finally {
  for (const sig of signatures) sql(repaired[sig]);
  for (const name of [enqueue, finish]) sql(`drop sequence if exists public.${probe(name)}`);
}
// Transaction-time schedule and validation contract, including both configuration reasons.
for (const reason of [null, 'rate_limit', 'provider_unavailable', 'provider_auth', 'timeout', 'network', 'invalid_provider_data', 'missing_secret', 'storage_unavailable', 'reconciliation_disabled', 'reconciliation_form_inactive']) {
  const minutes = reason === null ? 10 : reason === 'rate_limit' ? 15 : 5;
  workerSQL(`update crm_meta_reconciliation_state set lease_token='${token}',lease_until=now()+interval '55 seconds' where connection_id='${connection}' and form_key='95002';
    ${statement(finish, { ...args(token), p_error: reason })};
    do $$begin if not exists(select 1 from crm_meta_reconciliation_state where connection_id='${connection}' and form_key='95002' and lease_token is null and lease_until is null and next_due_at=now()+interval '${minutes} minutes' and last_error_code is not distinct from ${reason === null ? 'null' : q(reason)}) then raise exception 'scheduling changed';end if;end$$`);
}
workerSQL(`do $$begin begin perform crm_finish_meta_reconciliation('${connection}','95002','${token}','reconciliation_lease_lost');exception when sqlstate '22023' then return;end;raise exception 'lost ownership is not a finish diagnostic';end$$`);

// Idempotency, narrow revival, watermark, event bounds and processing/done preservation.
owned();
let r = await rpc(enqueue, { ...args(token), p_events: events('95401') }); assert.deepEqual(r,{ enqueued:1,existing:0 });
r = await rpc(enqueue, { ...args(token), p_events: events('95401') }); assert.deepEqual(r,{ enqueued:0,existing:1 });
const overlap = await Promise.all([rpc(enqueue,{ ...args(token),p_events:events('95402') }),
  client.rpc('crm_accept_meta_events',{ p_events:events('95402') }).then(x=>{ assert.ifError(x.error);return x.data; })]);
assert(overlap.length===2);assert.equal(sql("select count(*) from crm_ingestion_jobs where external_key='95001:95402'"),'1');
// Obtain a real done job through the shared resolver, satisfying the submission invariant.
sql(`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${director}';select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}')`);
await rpc('crm_claim_meta_jobs', { p_limit: 10 });
const resolvedJob = JSON.parse(sql("select to_jsonb(j) from crm_ingestion_jobs j where external_key='95001:95401'"));
const resolved = await rpc('crm_finalize_meta_job', { p_job: resolvedJob.id, p_lease: resolvedJob.lease_token,
  p_mapping: sql(`select id from crm_form_mappings where connection_id='${connection}' and form_key='95002'`),
  p_data: { occurred_at: new Date(resolvedJob.payload.created_time*1000).toISOString(),
    core_fields: { contact_name:'Repair Synthetic',phone:'0612345678',learner_name:'Synthetic',program_interest_text:'Annual English',session_type:'Yearly' },
    form_answers:[], source_label:'Synthetic repair test', attribution:{ external_submission_id:'95401',page_id:'95001',form_id:'95002',attribution_status:'partial',raw_payload:{} } } });
assert.equal(resolved.status,'done');assert(resolved.lead_id);
const crmCounts=sql('select (select count(*) from crm_submissions),(select count(*) from crm_leads)');
for (const jobStatus of ['done','processing','blocked']) {
  const leaseFields = jobStatus === 'processing' ? `lease_token='${token}',lease_until=now()+interval '2 minutes',` : 'lease_token=null,lease_until=null,';
  sql(`update crm_ingestion_jobs set status='${jobStatus}',${leaseFields}last_error_code='missing_mapping' where external_key='95001:95401'`);
  const before=queue();assert.deepEqual(await rpc(enqueue,{ ...args(token),p_events:events('95401') }),{enqueued:0,existing:1});assert.equal(queue(),before);
}
assert.equal(sql('select (select count(*) from crm_submissions),(select count(*) from crm_leads)'),crmCounts);
sql("update crm_ingestion_jobs set status='blocked',last_error_code='connection_disabled' where external_key='95001:95401'");
assert.deepEqual(await rpc(enqueue,{ ...args(token),p_events:events('95401') }),{enqueued:1,existing:0});
for (const p_events of [events('95403').map(e=>({...e,created_time:1700000000})),events('95403').map(e=>({...e,created_time:Math.ceil(Date.now()/1000)+301})),
  events('95403').map(e=>({...e,form_id:'wrong'})),Array.from({length:51},()=>events('95403')[0]),events('95403').map(e=>({...e,unexpected:true}))]) {
  const before=queue();const bad=await client.rpc(enqueue,{...args(token),p_events});assert.equal(bad.error?.code,'22023');assert.equal(queue(),before);
}

function asyncSQL(statement) {
  const p = spawn('psql', pgArgs, { env: processEnv }); let out='',err='';
  p.stdout.on('data', d=>{out+=d;});p.stderr.on('data',d=>{err+=d;});p.stdin.end(statement);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{p.kill();reject(new Error('concurrency deadline'));},10000);
    p.on('exit',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(new Error(err));});});
}
async function held(statement, concurrent, skipLocked = true) {
  const running=asyncSQL(`begin;set local request.jwt.claim.role='service_role';set local application_name='crm-repair-held';${statement};select pg_sleep(2);commit;`);
  for(let i=0;i<100;i++) {
    if(sql("select count(*) from pg_stat_activity where application_name='crm-repair-held' and wait_event='PgSleep'")==='1') break;
    if(i===99)throw new Error('lock holder not observed');await new Promise(resolve=>setTimeout(resolve,20));
  }
  const start=performance.now();const result=await concurrent();assert(performance.now()-start<(skipLocked ? 1000 : 5000),skipLocked ? 'locked reconciliation row must be skipped promptly' : 'overlapping claims must remain bounded');await running;return result;
}
// Real overlapping claims: one row can only be owned by one worker.
// Existing INSERT ON CONFLICT initialization may wait on an uncommitted UPDATE;
// the separate lock-only row test below proves the unchanged SKIP LOCKED selection.
sql(`update crm_meta_reconciliation_state set next_due_at=now()+interval '1 day' where connection_id='${connection}';
update crm_meta_reconciliation_state set next_due_at=now(),lease_token=null,lease_until=null where connection_id='${connection}' and form_key='95002'`);
let second=await held('select crm_claim_meta_reconciliation()',()=>rpc('crm_claim_meta_reconciliation'),false);
assert.equal(second,null);
assert.equal(workerSQL(`select lease_until-updated_at=interval '55 seconds' from crm_meta_reconciliation_state where connection_id='${connection}' and form_key='95002'`),'t');
// Locked first eligible row is skipped, allowing a different eligible form.
sql(`update crm_meta_reconciliation_state set next_due_at=now()-interval '1 minute',lease_token=null,lease_until=null where connection_id='${connection}' and form_key in ('95002','95003');
update crm_meta_reconciliation_state set next_due_at=now()-interval '2 minutes' where connection_id='${connection}' and form_key='95002'`);
second=await held(`select 1 from crm_meta_reconciliation_state where connection_id='${connection}' and form_key='95002' for update`,()=>rpc('crm_claim_meta_reconciliation'));
assert.equal(second.form_key,'95003');
const first=await rpc('crm_claim_meta_reconciliation');assert.equal(first.form_key,'95002');assert.notEqual(first.lease_token,second.lease_token);
await rpc(finish,{...args(first.lease_token)});await rpc(finish,{...args(second.lease_token,'95003')});
console.log('PASS real overlapping sessions, exclusivity, SKIP LOCKED, 55s/+10m/+15m/+5m schedule, idempotency, revival and watermark bounds');

// Real Auth-issued JWTs: director is still forbidden to execute worker RPCs/read state.
const anon=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const password='local-synthetic-repair-password';
const authUser=await client.auth.admin.createUser({email:'repair-http-director@example.invalid',password,email_confirm:true});assert.ifError(authUser.error);
sql(`update profiles set role='director' where id=${q(authUser.data.user.id)}`);
const directorClient=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
assert.ifError((await directorClient.auth.signInWithPassword({email:'repair-http-director@example.invalid',password})).error);
for(const deniedClient of [anon,directorClient]) {
  for(const name of ['crm_claim_meta_reconciliation',enqueue,finish]) {
    const response=await deniedClient.rpc(name,name==='crm_claim_meta_reconciliation'?{}:name===enqueue?{...args(),p_events:[]}:args());
    assert.equal(response.error?.code,'42501');
  }
  assert.equal((await deniedClient.from('crm_meta_reconciliation_state').select('*')).error?.code,'42501');
}
for(const role of ['anon','authenticated']) {
  sql(`begin;set local role ${role};set local request.jwt.claim.role='${role}';
    do $$begin begin perform public.crm_claim_meta_reconciliation();exception when sqlstate '42501' then return;end;raise exception 'worker authorization bypass';end$$;rollback;`);
  assert.equal(sql(`select has_function_privilege('${role}','public.${signatures[0]}','execute') or has_function_privilege('${role}','public.${signatures[1]}','execute') or has_table_privilege('${role}','crm_meta_reconciliation_state','select')`),'f');
}
assert.equal(sql(`select has_function_privilege('service_role','public.${signatures[0]}','execute') and has_function_privilege('service_role','public.${signatures[1]}','execute')`),'t');
console.log('PASS SQL and real anon/director JWT authorization, ACL/definer/search-path preservation');
assert.deepEqual(digests(),immutable);
console.log(`Versions: PostgreSQL ${sql('show server_version')}; Supabase CLI ${cli(['--version']).trim()}; client ${JSON.parse(readFileSync('node_modules/@supabase/supabase-js/package.json')).version}; PostgREST ${execFileSync('docker',['exec','supabase_rest_hills-admin-next','postgrest','--version'],{encoding:'utf8'}).trim()}`);
console.log(`Migration105 SHA-256 ${digest}`);
// Clear all synthetic committed fixtures/instrumentation for subsequent required CI suites.
cli(['db','reset','--local','--no-seed']);
console.log('PASS repair acceptance complete; local database reset to clean 001→105');

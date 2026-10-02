// LOCAL synthetic H3-04 acceptance. Fixed loopback database; no provider/HTTP client.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { processLifecycleDeliveries } from '../src/lib/crm/lifecycle/worker.mjs';

assertLocalFeatureBranch();
const env = { ...process.env, PGPASSWORD: 'postgres', DISABLE_EXTERNAL_EMAIL: 'true', SUPABASE_TELEMETRY_DISABLED: '1' };
const sql = s => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: s, env, encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024 }).trim();
const cli = args => execFileSync('supabase', args, { env, encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024 });
const q = s => `'${String(s).replaceAll("'", "''")}'`;
const expected = JSON.parse(readFileSync('scripts/fixtures/crm-h3-04-manifest.json'));
const migration = readFileSync('supabase/migrations/106_crm_lifecycle_provider_contract_r4_seed.sql', 'utf8');
const oldFiles = readdirSync('supabase/migrations').filter(f => /^\d{3}_/.test(f) && Number(f.slice(0, 3)) <= 105).sort();
assert.equal(oldFiles.length, 105);
const digests = () => oldFiles.map(f => createHash('sha256').update(readFileSync(`supabase/migrations/${f}`)).digest('hex'));
const beforeDigests = digests();
// No executable SQL beyond one atomic explicit VALUES insert; defaults only for created_at.
const executable = migration.replace(/--[^\n]*/g, '').trim();
assert.match(executable, /^begin;\s*insert into public\.crm_lifecycle_provider_contracts\s*\([\s\S]*\)\s*values\s*\([\s\S]*\);\s*commit;$/i);
assert.equal((executable.match(/;/g) || []).length, 3);
assert.equal((executable.match(/\binsert\b/gi) || []).length, 1);
assert(!/on\s+conflict|upsert|gen_random_uuid|\b(grant|alter|create|update|delete|truncate|select)\b/i.test(executable));
const fields = executable.match(/contracts\s*\(([^)]+)\)/i)[1].split(',').map(s => s.trim());
assert.deepEqual(fields.sort(), Object.keys(expected).sort());
const plan = readFileSync('docs/architecture/plans/crm-h3-technical-readiness.md', 'utf8');
for (const url of expected.evidence_urls) assert(plan.includes(url));
assert.deepEqual(expected.event_map, { intake: 'Intake', not_qualified: 'Not qualified', lost: 'Lost', qualified: 'Qualified', converted: 'Converted' });
assert.deepEqual(expected.required_constants, { event_source: 'crm', lead_event_source: 'English Hills CRM' });
function readback() {
  const rows = JSON.parse(sql("select coalesce(jsonb_agg(to_jsonb(c)), '[]') from crm_lifecycle_provider_contracts c where contract_key='eh_meta_crm_r4_v26_r1'"));
  assert.equal(rows.length, 1);
  const { created_at, ...actual } = rows[0];
  actual.approved_at = new Date(actual.approved_at).toISOString().replace('.000Z', 'Z');
  assert.deepEqual(actual, expected);
  assert(Number.isFinite(Date.parse(created_at)) && Date.parse(created_at) <= Date.now());
  sql(readFileSync('scripts/test-crm-h3-04-manifest.sql', 'utf8'));
}
function inventory() {
  return Object.fromEntries(sql("select tablename from pg_tables where schemaname='public' order by tablename").split('\n')
    .map(t => [t, JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${t} t`))]));
}
// Entire public/crm_security schema, including all function bodies (104/105), owners,
// ACLs, RLS, policies, constraints, trigger enablement and security attributes.
const catalog = () => execFileSync('docker', ['exec', 'supabase_db_hills-admin-next', 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--schema=public', '--schema=crm_security'],
  { env, encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024 }).replace(/^\\(?:un)?restrict .*$/gm, '');
const cron = () => sql("select coalesce(jsonb_agg(to_jsonb(j) order by jobid),'[]') from cron.job j");
function dormant() {
  assert.equal(sql('select count(*) from crm_lifecycle_provider_contracts'), '1');
  assert.equal(sql("select count(*) from crm_integration_connections where coalesce((lifecycle_settings->>'enabled')::boolean,false)"), '0');
  for (const t of ['crm_lifecycle_eligibility_policies','crm_lifecycle_eligibility_evidence','crm_lifecycle_eligibility_checks','crm_lifecycle_activation_epochs',
    'crm_lifecycle_producer_boundaries','crm_lifecycle_producer_ownership','crm_external_deliveries','crm_external_delivery_attempts']) assert.equal(sql(`select count(*) from ${t}`), '0', t);
  assert.equal(sql("select count(*) from cron.job where jobname='crm-lifecycle-primary' and not active"), '1');
  assert.equal(sql("select count(*) from cron.job_run_details where jobid in(select jobid from cron.job where jobname='crm-lifecycle-primary')"), '0');
  assert.equal(sql("select count(*) from crm_lifecycle_scheduler_health where last_started_at is not null"), '0');
}
function denies(statement, code) {
  sql(`begin; do $deny$ begin begin ${statement}; exception when sqlstate ${q(code)} then return; end; raise exception 'Expected SQLSTATE ${code}'; end $deny$; rollback;`);
}
function insert(patch) {
  return `insert into crm_lifecycle_provider_contracts select * from jsonb_populate_record(null::crm_lifecycle_provider_contracts,
    (select to_jsonb(c) from crm_lifecycle_provider_contracts c where id=${q(expected.id)}) || ${q(JSON.stringify(patch))}::jsonb)`;
}
console.log('H3-04: fresh local 001→106');
cli(['db','reset','--local','--no-seed']);
assert.equal(sql('select count(*),max(version::integer) from supabase_migrations.schema_migrations'), '106|106');
readback(); dormant();
for (const role of ['anon', 'authenticated', 'service_role']) {
  for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) assert.equal(sql(`select has_table_privilege(${q(role)},'crm_lifecycle_provider_contracts',${q(privilege)})`),'f');
  denies(`set local role ${role}; select * from crm_lifecycle_provider_contracts`, '42501');
  denies(`set local role ${role}; ${insert({ id:'96000000-0000-0000-0000-000000000001', contract_key:'h3_role_test' })}`, '42501');
}
assert.equal(sql("select relrowsecurity from pg_class where oid='crm_lifecycle_provider_contracts'::regclass"), 't');
assert.equal(sql("select count(*) from pg_policy where polrelid='crm_lifecycle_provider_contracts'::regclass"),'0');
assert.equal(sql("select count(*) from pg_trigger where tgrelid='crm_lifecycle_provider_contracts'::regclass and not tgisinternal and tgenabled='O' and tgname in('crm_lifecycle_contract_append_only','crm_lifecycle_contract_no_truncate')"),'2');
denies(insert({ id:'96000000-0000-0000-0000-000000000001' }), '23505');
denies(insert({ id:'96000000-0000-0000-0000-000000000001', revision:2 }), '23505');
denies(insert({ contract_key:'h3_uuid_collision' }), '23505');
for (const patch of [ { lifecycle_model:'legacy_first_attainment' }, { event_map:{} }, { event_map:{ ...expected.event_map, lost:'LOST' } },
  { required_constants:{} }, { required_constants:{ ...expected.required_constants, extra:'forbidden' } }, { deduplication_window_seconds:172800 },
  { uncertainty_policy:'legacy_bounded_dedup' }, { action_source:'phone_call' }, { accepted_response_field:'events-received' },
  { accepted_response_count:0 }, { accepted_response_count:2 }, { maximum_event_age_seconds:0 }, { maximum_event_age_seconds:604801 }, { lead_id_only:false } ]) {
  denies(insert({ id:'96000000-0000-0000-0000-000000000001', contract_key:'h3_invalid_contract', ...patch }), '23514');
}
denies(`update crm_lifecycle_provider_contracts set active=false where id=${q(expected.id)}`, '42501');
denies(`delete from crm_lifecycle_provider_contracts where id=${q(expected.id)}`, '42501');
// CASCADE avoids dependent-FK preflight so the actual no-truncate trigger is exercised.
denies('truncate crm_lifecycle_provider_contracts cascade', '42501');
// Reapplying the exact migration fails loudly, preserving the original row and catalog.
const freshInventory = inventory(), freshCatalog = catalog(), freshCron = cron();
try { sql(migration); assert.fail('exact migration replay must fail'); } catch (e) { assert.match(e.stderr?.toString() || '', /duplicate key/); }
assert.deepEqual(inventory(), freshInventory); assert.equal(catalog(), freshCatalog); assert.equal(cron(), freshCron);
let network = 0, rpcCalls = 0;
for (const settings of [{liveGate:false,env:{}},{liveGate:true,env:{}},{liveGate:false,env:{CRM_META_LIFECYCLE_LIVE_ENABLED:'true'}}]) {
  assert.deepEqual(await processLifecycleDeliveries({ ...settings, rpc: async()=>{rpcCalls++;throw new Error('gate bypass');}, fetchImpl:async()=>{network++;throw new Error('network forbidden');} }), []);
}
assert.equal(network,0); assert.equal(rpcCalls,0);
assert.equal(sql("begin; set local request.jwt.claim.role='service_role'; select crm_claim_external_deliveries(3,true); rollback;"), '[]');
dormant();
console.log('PASS exact manifest, collisions, 14 constraint cases, UPDATE/DELETE/TRUNCATE, ACL/RLS/triggers, dormancy and zero network');

console.log('H3-04: stateful local 105→106');
cli(['db','reset','--local','--version','105','--no-seed']);
// Synthetic inbound state and a pre-existing unrelated immutable provider row.
sql(`insert into auth.users(id,email,aud,role) values('96000000-0000-0000-0000-000000000010','h3-seed@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='96000000-0000-0000-0000-000000000010';
insert into crm_integration_connections(id,connection_key,page_id,api_version,access_token_secret_ref,settings,created_by,updated_by)
values('96000000-0000-0000-0000-000000000011','h3_seed_fixture','96001','v26.0','CRM_META_PAGE_TOKEN_TEST','{}','96000000-0000-0000-0000-000000000010','96000000-0000-0000-0000-000000000010');
insert into crm_meta_reconciliation_state(connection_id,form_key,next_due_at,last_error_code)
values('96000000-0000-0000-0000-000000000011','96002',now()+interval '1 day','missing_mapping');`);
// Existing valid contract exercises preservation of append-only registry history.
sql(`insert into crm_lifecycle_provider_contracts(id,contract_key,revision,api_version,qualified_event_name,converted_event_name,action_source,maximum_event_age_seconds,deduplication_window_seconds,accepted_response_field,lead_id_only,evidence_urls,verified_on,approved_at)
values('96000000-0000-0000-0000-000000000012','h3_historical_fixture',1,'v99.0','Qualified','Converted','system_generated',604800,172800,'events_received',true,'["https://example.invalid/synthetic"]',current_date,now());`);
const before = inventory(), beforeCatalog = catalog(), beforeCron = cron();
const beforeAuth = sql("select jsonb_agg(to_jsonb(u) order by id) from auth.users u");
cli(['migration','up','--local']);
const after = inventory(); readback();
after.crm_lifecycle_provider_contracts = after.crm_lifecycle_provider_contracts.filter(c=>c.id!==expected.id);
assert.deepEqual(after, before);
assert.equal(catalog(), beforeCatalog); assert.equal(cron(), beforeCron);
assert.equal(sql("select jsonb_agg(to_jsonb(u) order by id) from auth.users u"), beforeAuth);
assert.equal(sql('select count(*) from crm_lifecycle_provider_contracts'),'2');
assert.deepEqual(digests(), beforeDigests);
console.log('PASS stateful 105→106: exactly one additive row; every public row, Auth fixture, schema/security/function body and cron unchanged');
cli(['db','reset','--local','--no-seed']); readback(); dormant();
console.log(`PASS H3-04 complete; migration SHA-256 ${createHash('sha256').update(migration).digest('hex')}; local database clean 001→106`);

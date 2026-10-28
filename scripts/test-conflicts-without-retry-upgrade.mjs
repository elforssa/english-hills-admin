// Destructive LOCAL acceptance for migration 119 (plan NRC-r2, ADR-009): reset to
// 118, snapshot every application function, apply 119, and prove the rebuild is
// mechanical. Then prove the catalog zero rule passes and fails on a probe.
// Never reads .env.local or accepts a database URL from the environment.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';

assertLocalFeatureBranch();
const processEnv = { ...process.env, PGPASSWORD: 'postgres', SUPABASE_TELEMETRY_DISABLED: '1', DISABLE_EXTERNAL_EMAIL: 'true' };
const pgArgs = ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const sql = s => execFileSync('psql', pgArgs, { input: s, encoding: 'utf8', env: processEnv, timeout: 30000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const cli = args => execFileSync('supabase', args, { encoding: 'utf8', env: processEnv, timeout: 300000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const catalogCheck = readFileSync('scripts/test-sqlstate-catalog.sql', 'utf8');
const migration = readFileSync('supabase/migrations/119_conflicts_without_retry.sql', 'utf8');

// Object manifest: the 43 inventoried functions (plan NRC-r2, Inventory).
const MANIFEST = [
  'crm_security.accept_external_submission(uuid,uuid,uuid)', 'crm_security.command(text,uuid,jsonb)',
  'crm_security.finish_task(crm_tasks,boolean,text,text)', 'crm_security.lifecycle_barrier(boolean)',
  'crm_security.lifecycle_lock_delivery(uuid,boolean)', 'crm_security.lock_enrollment_intent(uuid)',
  'online_security.course_for_update(uuid,bigint)', 'online_security.lesson_for_update(uuid,bigint)',
  'append_receptionist_enrollment_document(uuid,timestamp with time zone,text)',
  'assign_receptionist_student_group(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone)',
  'create_charge_payment(jsonb)', 'crm_begin_external_attempt(uuid,uuid)', 'crm_block_external_delivery(uuid,uuid,text)',
  'crm_book_placement_test(uuid,jsonb)', 'crm_configure_insights(uuid,bigint,jsonb)', 'crm_configure_lifecycle(uuid,bigint,jsonb)',
  'crm_disable_lifecycle(uuid,bigint)', 'crm_fail_insights_sync(uuid,uuid,text,integer)', 'crm_fail_meta_job(uuid,uuid,text)',
  'crm_finalize_meta_job(uuid,uuid,uuid,jsonb)', 'crm_finalize_website_job(uuid,uuid,uuid,jsonb)',
  'crm_finish_external_attempt(uuid,uuid,jsonb)', 'crm_finish_insights_sync(uuid,uuid,jsonb)',
  'crm_get_external_delivery(uuid,uuid)', 'crm_get_meta_job_mapping(uuid,uuid,text,timestamp with time zone)',
  'crm_get_website_job_mapping(uuid,uuid)', 'crm_prepare_external_delivery(uuid,uuid,jsonb)',
  'crm_publish_lifecycle_policy(uuid,bigint,jsonb)', 'crm_record_conversation_decision(uuid,jsonb)',
  'crm_request_insights_sync(uuid,uuid,date,date)', 'crm_resolve_meta_intake(uuid,uuid,text,jsonb)',
  'crm_retire_lifecycle_policy(uuid,integer)', 'crm_retry_insights_sync(uuid)', 'crm_save_meta_connection(jsonb,uuid,bigint)',
  'crm_save_website_connection(jsonb,uuid,bigint)', 'crm_start_enrollment(uuid,jsonb)', 'crm_update_placement_test(uuid,jsonb)',
  'save_receptionist_group(uuid,timestamp with time zone,jsonb)',
  'save_receptionist_premium_attendance(uuid,uuid,text,timestamp with time zone)',
  'save_receptionist_premium_membership(uuid,timestamp with time zone,uuid,uuid,date)',
  'save_receptionist_premium_session(uuid,timestamp with time zone,jsonb)',
  'save_receptionist_student(uuid,timestamp with time zone,jsonb)',
  'save_receptionist_teacher_operations(uuid,timestamp with time zone,jsonb)'
];
assert.equal(new Set(MANIFEST).size, 43);

// The three substitutions of the SQL contract, whitespace-tolerant.
const ERRCODE = /(errcode\s*=\s*)'40001'/g;
const FAIL = /(online_security\.fail\('stale',\s*)'40001'/g;
const HANDLER = 'exception when serialization_failure then';
function substitute(body) {
  const counts = [(body.match(ERRCODE) || []).length, (body.match(FAIL) || []).length, body.split(HANDLER).length - 1];
  const next = body.replace(ERRCODE, "$1'PT409'").replace(FAIL, "$1'PT409'").replaceAll(HANDLER, "exception when sqlstate 'PT409' then");
  return { next, counts };
}

// Every non-platform, non-extension function with every attribute the contract freezes.
const catalog = () => JSON.parse(sql(`select coalesce(jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_object(
    'owner', p.proowner::regrole::text, 'acl', p.proacl::text, 'definer', p.prosecdef, 'config', p.proconfig,
    'argnames', p.proargnames, 'argtypes', p.proargtypes::text, 'allargtypes', p.proallargtypes::text, 'argmodes', p.proargmodes,
    'defaults', pg_get_expr(p.proargdefaults, 0), 'returns', pg_get_function_result(p.oid), 'retset', p.proretset,
    'volatile', p.provolatile, 'strict', p.proisstrict, 'parallel', p.proparallel, 'leakproof', p.proleakproof,
    'cost', p.procost, 'rows', p.prorows, 'kind', p.prokind, 'lang', l.lanname, 'src', p.prosrc)), '{}')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
  where n.nspname not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions', 'graphql',
      'graphql_public', 'pgbouncer', 'vault', 'cron', 'net', 'supabase_functions', 'supabase_migrations')
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')`));
// Schema objects the migration must not touch.
const surroundings = () => sql(`select jsonb_build_object(
  'policies', (select jsonb_agg(to_jsonb(x) order by x.schemaname, x.tablename, x.policyname) from pg_policies x),
  'triggers', (select jsonb_agg(jsonb_build_object('t', tgrelid::regclass::text, 'n', tgname, 'f', tgfoid::regprocedure::text, 'e', tgenabled) order by tgrelid::regclass::text, tgname) from pg_trigger where not tgisinternal),
  'tables', (select jsonb_agg(jsonb_build_object('t', c.oid::regclass::text, 'acl', c.relacl::text, 'rls', c.relrowsecurity) order by c.oid::regclass::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'v', 'm', 'p') and n.nspname in ('public', 'crm_security', 'online_security', 'operational_security', 'storage_security', 'role_security')),
  'columns', (select count(*) from information_schema.columns where table_schema = 'public'),
  'cron', (select coalesce(jsonb_agg(to_jsonb(j) order by jobid), '[]') from cron.job j))`);
function catalogFails() {
  try { sql(catalogCheck); return null; } catch (error) { return String(error.stderr || error.message); }
}

console.log('Resetting local database to migration 118');
cli(['db', 'reset', '--local', '--version', '118', '--no-seed']);
assert.equal(sql('select max(version::integer) from supabase_migrations.schema_migrations'), '118');
const before = catalog(), beforeAround = surroundings();
const offenders = Object.keys(before).filter(name => before[name].src.includes("'40001'") || /serialization_failure/i.test(before[name].src)).sort();
assert.deepEqual(offenders, [...MANIFEST].sort(), 'inventory at 118 differs from the plan manifest: STOP');
assert.match(catalogFails() || '', /ADR-009/, 'the catalog zero rule must fail at 118');

// The 119 file directly: `supabase migration up` would also apply every later
// migration (EGC 120 and 121, Batch E 122, portal readiness 123). The ledger is brought to current at the end.
console.log('Applying the 119 file');
sql(migration);
assert.equal(sql('select max(version::integer) from supabase_migrations.schema_migrations'), '118');
assert(!/40001/.test(migration) && !/serialization_failure/.test(migration), 'migration file names the old code');
const after = catalog();
assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'a function was added or dropped');
const totals = [0, 0, 0];
for (const name of Object.keys(before)) {
  const old = { ...before[name] }, current = { ...after[name] };
  if (MANIFEST.includes(name)) {
    const { next, counts } = substitute(old.src);
    counts.forEach((n, i) => { totals[i] += n; });
    assert.equal(current.src, next, `${name}: body is not the mechanical substitution of its 118 body`);
    assert.notEqual(current.src, old.src, `${name}: body unchanged`);
    assert(!current.src.includes("'40001'") && !/serialization_failure/.test(current.src), name);
  } else {
    assert.equal(current.src, old.src, `${name}: body outside the manifest changed`);
  }
  delete old.src; delete current.src;
  assert.deepEqual(current, old, `${name}: owner, ACL, security or signature attribute changed`);
}
assert.deepEqual(totals, [70, 2, 1], 'literal count other than 70 errcode clauses + 2 fail arguments + 1 handler: STOP');
assert.equal(surroundings(), beforeAround, 'a policy, trigger, table ACL, column or schedule changed');
assert.equal(sql("select count(*) from pg_proc where prosrc ~ 'PT409'"), '45', '43 rebuilt functions plus the two from 105');
for (const name of MANIFEST.filter(n => !n.startsWith('crm_security.') && !n.startsWith('online_security.'))) {
  assert.equal(after[name].definer, true, `${name}: SECURITY DEFINER`);
}
for (const name of MANIFEST) assert.deepEqual(after[name].config, ['search_path=pg_catalog, pg_temp'], name);
console.log('PASS mechanical 118→119: 43 bodies equal the substitution (70 + 2 + 1), every other attribute and object unchanged');

assert.equal(catalogFails(), null, 'catalog zero rule after 119');
// Guard regression: the zero rule catches a reintroduced raise and a reintroduced handler.
const probes = {
  raise: `create function public.ci_sqlstate_probe() returns void language plpgsql as $$ begin raise exception 'probe' using errcode = '40001'; end $$`,
  handler: `create function crm_security.ci_sqlstate_probe() returns void language plpgsql as $$ begin perform 1; exception when serialization_failure then raise; end $$`
};
for (const [kind, create] of Object.entries(probes)) {
  sql(create);
  try { assert.match(catalogFails() || '', /ci_sqlstate_probe/, `catalog zero rule missed a ${kind} probe`); }
  finally { sql('drop function if exists public.ci_sqlstate_probe(); drop function if exists crm_security.ci_sqlstate_probe();'); }
}
assert.equal(catalogFails(), null);
console.log('PASS catalog zero rule: clean after 119, fails on a reintroduced raise and handler');
console.log('Bringing the ledger to the current migrations with supabase migration up');
cli(['migration', 'up', '--local']);
assert.equal(sql("select name from supabase_migrations.schema_migrations where version = '119'"), 'conflicts_without_retry');
assert.equal(sql('select max(version::integer) from supabase_migrations.schema_migrations'), '124');
assert.equal(catalogFails(), null, 'catalog zero rule at the current migrations');

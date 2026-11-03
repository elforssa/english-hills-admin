// Local synthetic 125→126 stateful upgrade (lead ad source). Run after
// `supabase db reset --local --version 125 --no-seed`: fingerprints the catalog and every
// public row under the 125 definitions, applies the 126 file directly (`supabase
// migration up` would also apply any later file; the ledger stays at 125), then proves
// that exactly one body changed (crm_get_operational_acquisition_summary, same
// signature, posture, owner and grants), exactly one private function was added
// (crm_security.inquiry_ad_source, no API grant), nothing else in the catalog moved,
// no row was rewritten, and the rollback-only acceptance passes on the upgraded state.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const sql = input => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 50 * 1024 * 1024 }).trim();
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '125', 'run on a database at migration 125');
const replaced = 'crm_get_operational_acquisition_summary(uuid)';
const added = 'crm_security.inquiry_ad_source(uuid)';
const catalog = () => JSON.parse(sql(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text,p.prorettype::regtype::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'tables',(select jsonb_object_agg(relnamespace::regnamespace::text||'.'||relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relkind='r' and relnamespace in ('public'::regnamespace,'crm_security'::regnamespace)),
 'columns',(select jsonb_object_agg(table_schema||'.'||table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema in ('public','crm_security')),
 'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname in ('public','crm_security')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),
 'jobs',(select jsonb_agg(jsonb_build_array(jobname,schedule,command,active) order by jobname) from cron.job))::text`));
const tables = sql("select tablename from pg_tables where schemaname='public' order by tablename").split('\n');
const data = () => Object.fromEntries(tables.map(table => { assert(/^[a-z_0-9]+$/.test(table)); return [table, sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.${table} t`)]; }));
const before = catalog(), beforeData = data();
assert(replaced in before.functions, 'the 107 read exists at 125');
assert(!(added in before.functions), 'the resolver is absent at 125');
sql(readFileSync('supabase/migrations/126_crm_lead_ad_source.sql', 'utf8'));
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '125', 'the file alone does not touch the ledger');
const after = catalog();
assert(added in after.functions, 'the resolver is created');
assert.deepEqual(after.functions[added].slice(1), [true, 's', ['search_path=pg_catalog, pg_temp'], 'postgres', '{postgres=X/postgres}', 'jsonb'], 'resolver: SECURITY DEFINER, STABLE, fixed search_path, owner postgres, no API grant');
delete after.functions[added];
assert.notEqual(after.functions[replaced][0], before.functions[replaced][0], 'the read body changed');
assert.deepEqual(after.functions[replaced].slice(1), before.functions[replaced].slice(1), 'the read keeps its posture, search_path, owner, grants and return type');
assert.deepEqual(after.functions[replaced].slice(1), [true, 's', ['search_path=pg_catalog, pg_temp'], 'postgres', '{postgres=X/postgres,authenticated=X/postgres}', 'jsonb']);
after.functions[replaced] = before.functions[replaced];
assert.deepEqual(after, before, 'nothing else in the catalog changed: no table, column, constraint, index, policy, trigger, job or other function');
assert.deepEqual(data(), beforeData, 'no row rewritten');
// The rollback-only acceptance passes on the upgraded state (it rolls back).
const acceptance = execFileSync('psql', ['-X', '-q', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', 'scripts/test-crm-lead-ad-source.sql'], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } });
assert.match(acceptance, /PASS lead ad source/);
assert.deepEqual(data(), beforeData, 'the acceptance left no row');
console.log(`PASS stateful 125→126: ${tables.length} table hashes unchanged, one body replaced with its posture and grants intact, one private resolver added, nothing else moved, acceptance green on the upgraded state`);

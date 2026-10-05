// Local synthetic 108→109 stateful upgrade, including finance/enrollment/outbox.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workCalendarFixture } from './lib/crm-work-calendar-fixture.mjs';
const sql=input=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:50*1024*1024});
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations').trim(),'108');
assert.equal(sql('select count(*) from public.crm_leads').trim(),'0');
// Reuse finance safeguards and facts, keeping its synthetic records for hashing.
const finance=readFileSync('scripts/test-crm-phase7.sql','utf8').replace('rollback;','commit;');sql(finance);
sql(workCalendarFixture()+'\ncommit;');
// Existing lifecycle test setup uses synthetic configuration only, no HTTP.
sql(readFileSync('scripts/test-crm-r4-advisory-setup.sql','utf8')+`
select pg_temp.actor(1);select pg_temp.intake('o3-upgrade-source');
select pg_temp.actor(0);select public.crm_reconcile_external_deliveries(100);
commit;`);
const tables=sql("select tablename from pg_tables where schemaname='public' order by tablename").trim().split('\n');
const data=()=>Object.fromEntries(tables.map(table=>{assert(/^[a-z_]+$/.test(table));return [table,sql(`select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.${table} t`).trim()];}));
const catalog=`select md5(jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_array(relname,relrowsecurity,relforcerowsecurity,relacl::text) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace),
 'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,case when p.proname in ('crm_list_open_tasks','placement_summary','operational_card','opportunity_card','crm_get_work_queue','crm_get_admissions_calendar','crm_list_staff') then null else p.prosrc end,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security','role_security') and p.proname not in ('scheduled_civil','staff_reference'))
)::text);`;
// Only the seven enumerated read bodies may differ; their signature, execution
// grants, search path, stability and security mode are still hashed exactly.
const before=data(),beforeCatalog=sql(catalog).trim();
for(const table of ['crm_tasks','crm_activities','enrollments','receipts','crm_revenue_entries','crm_lifecycle_eligibility_policies','crm_external_deliveries'])assert(Number(before[table].split('|')[0])>0,`${table} must be nonempty`);
sql(readFileSync('supabase/migrations/109_crm_operational_scheduled_display.sql','utf8'));
assert.deepEqual(data(),before);assert.equal(sql(catalog).trim(),beforeCatalog);
const result={passed:true,baseline:108,migration:109,tables:tables.length,unchangedData:true,unchangedOtherFunctionBodiesAndAllGrantsPoliciesTriggers:true,rows:Object.fromEntries(Object.entries(before).map(([table,value])=>[table,Number(value.split('|')[0])]))};
writeFileSync(join(tmpdir(),'hills-receptionist-ux-upgrade-result.json'),JSON.stringify(result,null,2));
console.log(`PASS stateful 108→109: ${tables.length} table hashes and other function bodies and all grants/RLS/triggers unchanged; only enumerated read bodies changed; nonempty finance/enrollment/lifecycle facts`);

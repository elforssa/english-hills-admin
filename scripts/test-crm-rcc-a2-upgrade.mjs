// Local synthetic 111→112 stateful upgrade, including finance/enrollment/outbox and
// an enrollment result stored before the migration.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workCalendarFixture } from './lib/crm-work-calendar-fixture.mjs';
const sql=input=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:50*1024*1024});
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations').trim(),'111');
assert.equal(sql('select count(*) from public.crm_leads').trim(),'0');
// Reuse finance safeguards and facts, keeping its synthetic records for hashing.
const finance=readFileSync('scripts/test-crm-phase7.sql','utf8').replace('rollback;','commit;');sql(finance);
sql(workCalendarFixture()+'\ncommit;');
// Existing lifecycle test setup uses synthetic configuration only, no HTTP.
sql(readFileSync('scripts/test-crm-r4-advisory-setup.sql','utf8')+`
select pg_temp.actor(1);select pg_temp.intake('rcc-a2-upgrade-source');
select pg_temp.actor(0);select public.crm_reconcile_external_deliveries(100);
commit;`);
// One enrollment initiated by the 084 definition; its stored result must replay unchanged.
const actor=sql("select id from public.profiles where role='receptionist' order by id limit 1").trim();assert(actor);
const rpc=(name,data,key=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(actor)};set local role authenticated;select public.crm_${name}(${quote(key)},${quote(JSON.stringify(data))}::jsonb);commit;`).trim().split('\n').at(-1));
const lead=rpc('create_manual_lead',{display_name:'A2 upgrade parent',learner_name:'A2upgrade Learner',phone:'0655501234',source_label:'Manual'}).lead;
const qualified=rpc('qualify_lead',{lead_id:lead.id,expected_version:lead.version,conversation_channel:'phone',note:'A2 upgrade',qualification_step:'placement_test',
 next_task:{task_type:'confirm_placement_test',due_at:new Date(Date.now()+2*86400000).toISOString()}}).lead;
const token=sql(`select crm_security.candidate_token(${quote(lead.id)},'A2upgrade Learner',null)`).trim();
const payload={lead_id:lead.id,expected_version:qualified.version,student_choice:'new',learner_name:'A2upgrade Learner',candidate_review:token,session_type:'Yearly',school_year:'2026/2027'};
const key=randomUUID(),stored=rpc('start_enrollment',payload,key);
assert.equal(stored.enrollment.status,'Submitted');assert(!('enrollment_followup' in stored),'084 result has no follow-up field');
const tables=sql("select tablename from pg_tables where schemaname='public' order by tablename").trim().split('\n');
const data=()=>Object.fromEntries(tables.map(table=>{assert(/^[a-z_0-9]+$/.test(table));return [table,sql(`select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.${table} t`).trim()];}));
const changed=['crm_start_enrollment','crm_get_enrollment_context'];
// Only the two enumerated public bodies may differ; their signature, execution
// grants, search path, stability and security mode are still hashed exactly.
const catalog=`select md5(jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_array(relname,relrowsecurity,relforcerowsecurity,relacl::text) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace),
 'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,case when n.nspname='public' and p.proname in (${changed.map(quote).join(',')}) then null else p.prosrc end,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security','role_security','operational_security','storage_security'))
)::text);`;
const guarded=`select string_agg(p.oid::regprocedure::text||':'||md5(p.prosrc),',' order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname,p.proname) in (('crm_security','command'),('crm_security','new_task'),('crm_security','next_window'),('crm_security','evaluate_conversion'),('crm_security','lock_enrollment_intent'),('public','create_charge_payment'))`;
const before=data(),beforeCatalog=sql(catalog).trim(),beforeGuarded=sql(guarded).trim();
for(const table of ['crm_tasks','crm_activities','crm_command_requests','enrollments','students','receipts','crm_revenue_entries','crm_lifecycle_eligibility_policies','crm_external_deliveries'])assert(Number(before[table].split('|')[0])>0,`${table} must be nonempty`);
const bodies=sql(`select string_agg(proname||':'||md5(prosrc),',' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in (${changed.map(quote).join(',')})`).trim();
sql(readFileSync('supabase/migrations/112_crm_rcc_a2_enrollment_ux.sql','utf8'));
assert.deepEqual(data(),before,'no data change and no backfill');assert.equal(sql(catalog).trim(),beforeCatalog,'only the two function bodies differ');
assert.equal(sql(guarded).trim(),beforeGuarded,'command, new_task, next_window, evaluate_conversion, intent lock and create_charge_payment byte-identical');
const after=sql(`select string_agg(proname||':'||md5(prosrc),',' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in (${changed.map(quote).join(',')})`).trim();
assert.notEqual(after.split(',')[0].split(':')[1],bodies.split(',')[0].split(':')[1],'context read replaced');assert.notEqual(after.split(',')[1].split(':')[1],bodies.split(',')[1].split(':')[1],'start replaced');
// The pre-migration stored result replays byte-identically, without the new field.
assert.deepEqual(rpc('start_enrollment',payload,key),stored,'stored 084 result replays unchanged');
assert.deepEqual(data(),before,'replay writes nothing');
const result={passed:true,baseline:111,migration:112,tables:tables.length,unchangedData:true,noBackfill:true,preMigrationReplayUnchanged:true,unchangedOtherFunctionBodiesAndAllGrantsPoliciesTriggers:true,rows:Object.fromEntries(Object.entries(before).map(([table,value])=>[table,Number(value.split('|')[0])]))};
writeFileSync(join(tmpdir(),'hills-rcc-a2-upgrade-result.json'),JSON.stringify(result,null,2));
console.log(`PASS stateful 111→112: ${tables.length} table hashes unchanged, no backfill, pre-migration result replays unchanged, guarded functions byte-identical, other function bodies and all grants/RLS/triggers unchanged`);

// Dedicated disposable database-only Supabase project; never development/Production.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const port=process.env.O3_UPGRADE_PORT || '55322';assert(port==='55322' || port==='54322' && process.env.GITHUB_ACTIONS==='true');
const sql=input=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:20*1024*1024});
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations').trim(),'106');
assert.equal(sql('select count(*) from public.crm_leads').trim(),'0');
const source=readFileSync('scripts/test-crm-opportunities.sql','utf8');
sql(source.slice(source.indexOf('begin;'),source.indexOf('do $$ declare r jsonb;'))+'\ncommit;');
const tables=sql("select tablename from pg_tables where schemaname='public' order by tablename").trim().split('\n');
function dataSnapshot(){return Object.fromEntries(tables.map(table=>{assert(/^[a-z_]+$/.test(table));return [table,sql(`select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.${table} t`).trim()];}));}
const catalog=`select md5(jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_array(relname,relrowsecurity,relforcerowsecurity,relacl::text) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
 'policies',(select jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) order by schemaname,tablename,policyname) from pg_policies),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace),
 'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.prosrc,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security','role_security') and p.proname not in ('crm_get_opportunities','crm_get_opportunity_filter_options','crm_get_operational_acquisition_summary','crm_get_timeline','o3_cursor','opportunity_ids','opportunity_card'))
)::text);`;
const before=dataSnapshot(),beforeCatalog=sql(catalog).trim();
sql(readFileSync('supabase/migrations/107_crm_opportunities_workspace_reads.sql','utf8'));
assert.deepEqual(dataSnapshot(),before);assert.equal(sql(catalog).trim(),beforeCatalog);
writeFileSync('/tmp/o3-upgrade-result.json',JSON.stringify({passed:true,baseline:106,migration:107,tables:tables.length,unchangedData:true,unchangedExistingFunctionsGrantsPoliciesTriggers:true,fixture:{opportunities:10000,tasks:50000,placements:120}},null,2));
console.log(`PASS stateful 106→107: ${tables.length} table hashes, existing functions/grants/RLS/triggers unchanged`);

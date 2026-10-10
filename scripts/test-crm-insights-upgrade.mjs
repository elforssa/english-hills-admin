// Local synthetic 113→114 stateful upgrade (DGI-A-r2). Run after
// `supabase db reset --local --version 113 --no-seed`: builds Insights state under the
// 089 definitions, applies the 114 file directly (`supabase migration up` would also
// apply 115 and later, as the older rehearsals handle it), then proves the
// backfilled column, the preserved snapshot, the retryable partial run, the inactive job
// and an unchanged catalog apart from the enumerated objects.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const sql=input=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:50*1024*1024}).trim();
const last=output=>output.split('\n').at(-1);
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'),'113');
assert.equal(sql('select count(*) from public.crm_meta_sync_runs'),'0');
const director=randomUUID(),connection=randomUUID();
const as=(who,body)=>last(sql(`begin;set local request.jwt.claim.sub='${who==='service'?'':director}';set local request.jwt.claim.role='${who==='service'?'service_role':'authenticated'}';${body};commit;`));
// 089 state: a mock connection, a completed snapshot and a partial run.
sql(`insert into auth.users(id,email,aud,role) values('${director}','insights-upgrade-${director}@example.invalid','authenticated','authenticated');update profiles set role='director' where id='${director}';
insert into crm_integration_connections(id,provider,connection_key,page_id,api_version,created_by,updated_by) values('${connection}','meta','insights-upgrade','330001','v99.0','${director}','${director}');`);
as('director',`select crm_configure_insights('${connection}',1,'{"mode":"mock","enabled":true,"account_id":"3300","currency":"MAD","timezone":"Africa/Casablanca","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE","refresh_days":7}')`);
const completed=as('director',`select crm_request_insights_sync('${connection}','${randomUUID()}','2026-01-01','2026-01-02')`);
let claim=JSON.parse(as('service','select crm_claim_insights_sync()'));assert.equal(claim.id,completed);assert(!('attempt_count' in claim),'089 claim shape before the upgrade');
as('service',`select crm_finish_insights_sync('${claim.id}','${claim.lease_token}','{"account_id":"3300","currency":"MAD","timezone":"Africa/Casablanca","objects":[{"type":"campaign","id":"331","name":"Upgrade campaign"}],"rows":[{"date":"2026-01-01","campaign_id":"331","adset_id":"332","ad_id":"333","spend":"75"}]}')`);
const partial=as('director',`select crm_request_insights_sync('${connection}','${randomUUID()}','2026-01-03','2026-01-04')`);
claim=JSON.parse(as('service','select crm_claim_insights_sync()'));assert.equal(claim.id,partial);
as('service',`select crm_fail_insights_sync('${claim.id}','${claim.lease_token}','provider_unavailable',2)`);
assert.equal(sql(`select status||':'||rows_processed from crm_meta_sync_runs where id='${partial}'`),'partial:2');
assert.match(as('director',`select crm_get_marketing_cohort('2026-01-01','2026-01-02',null,'${connection}')->>'live_sync_enabled'`),/^false$/);
// Catalog fingerprint: everything except the enumerated replaced bodies must be identical.
const replaced=['crm_configure_insights','crm_request_insights_sync','crm_retry_insights_sync','crm_claim_insights_sync','crm_fail_insights_sync','crm_insights_diagnostics','crm_get_marketing_cohort'];
const added=['crm_enqueue_insights_refresh()','crm_security.invoke_crm_insights_scheduler()'];
const catalog=()=>JSON.parse(sql(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(case when n.nspname='public' and p.proname in (${replaced.map(n=>`'${n}'`).join(',')}) then null else md5(p.prosrc) end,p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security','role_security','operational_security','storage_security')),
 'tables',(select jsonb_object_agg(relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
 'columns',(select jsonb_object_agg(table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema='public' and not (table_name='crm_meta_sync_runs' and column_name='next_attempt_at')),
 'indexes',(select jsonb_object_agg(indexname,case when indexname='crm_sync_queue' then null else indexdef end) from pg_indexes where schemaname='public'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),
 'jobs',(select jsonb_agg(jsonb_build_array(jobname,schedule,command,active) order by jobname) from cron.job))::text`));
const tables=sql("select tablename from pg_tables where schemaname='public' order by tablename").split('\n');
const data=()=>Object.fromEntries(tables.map(table=>{assert(/^[a-z_0-9]+$/.test(table));const columns=table==='crm_meta_sync_runs'?"to_jsonb(t)-'next_attempt_at'":'to_jsonb(t)';return [table,sql(`select count(*)||':'||md5(coalesce(string_agg((${columns})::text,'' order by (${columns})::text),'')) from public.${table} t`)];}));
const replacedAcl=()=>sql(`select string_agg(p.oid::regprocedure::text||'='||p.proacl::text,',' order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in (${replaced.map(n=>`'${n}'`).join(',')})`);
const before=catalog(),beforeData=data(),beforeAcl=replacedAcl();
for(const name of added)assert(!(name in before.functions),`${name} absent before 114`);
// Apply exactly the reviewed forward migration file (the ledger stays at 113 here).
sql(readFileSync('supabase/migrations/114_crm_meta_insights_live_sync.sql','utf8'));
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'),'113');
const after=catalog();
for(const name of added)assert(name in after.functions,`${name} created`);
for(const name of added)delete after.functions[name];
const jobs=after.jobs;after.jobs=jobs.filter(job=>job[0]!=='crm-insights-primary');
assert.deepEqual(after,before,'only the enumerated function bodies, the replaced index and the new objects differ; every grant, policy, trigger and existing job is unchanged');
assert.deepEqual(jobs.find(job=>job[0]==='crm-insights-primary'),['crm-insights-primary','*/30 * * * *','select crm_security.invoke_crm_insights_scheduler()',false],'scheduler job created inactive');
assert.equal(replacedAcl(),beforeAcl,'replaced functions keep their exact grants');
assert.equal(sql("select proacl::text from pg_proc where oid='public.crm_enqueue_insights_refresh()'::regprocedure"),'{postgres=X/postgres,service_role=X/postgres}');
assert.equal(sql("select proacl::text from pg_proc where oid='crm_security.invoke_crm_insights_scheduler()'::regprocedure"),'{postgres=X/postgres}');
assert.equal(sql("select indexdef from pg_indexes where indexname='crm_sync_queue'"),"CREATE INDEX crm_sync_queue ON public.crm_meta_sync_runs USING btree (next_attempt_at, created_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text]))");
assert.deepEqual(data(),beforeData,'no existing row rewritten');
// The column default backfilled every existing run with one migration timestamp.
assert.equal(sql("select count(*)||':'||count(distinct next_attempt_at)||':'||bool_and(next_attempt_at<=now()) from crm_meta_sync_runs"),'2:1:true');
assert.equal(sql("select is_nullable||':'||column_default from information_schema.columns where table_name='crm_meta_sync_runs' and column_name='next_attempt_at'"),'NO:now()');
// The completed 089 snapshot is still reported; the partial 089 run is retryable and claimable.
const report=JSON.parse(as('director',`select crm_get_marketing_cohort('2026-01-01','2026-01-02',null,'${connection}')`));
assert.equal(report.spend_complete,true);assert.equal(Number(report.summary.spend),75);assert.equal(report.live_sync_enabled,false);
as('director',`select crm_retry_insights_sync('${partial}')`);
assert.equal(sql(`select status||':'||(next_attempt_at=now())::text from crm_meta_sync_runs where id='${partial}'`).split(':')[0],'pending');
claim=JSON.parse(as('service','select crm_claim_insights_sync()'));assert.equal(claim.id,partial);assert.equal(claim.attempt_count,2);assert.equal(claim.config.mode,'mock');
// A pre-upgrade mock connection keeps the 089 failure contract and is never auto-enqueued.
as('service',`select crm_fail_insights_sync('${claim.id}','${claim.lease_token}','network')`);
assert.equal(sql(`select status from crm_meta_sync_runs where id='${partial}'`),'failed');
assert.equal(as('service','select crm_enqueue_insights_refresh()'),'0');
const diagnostics=JSON.parse(as('director','select crm_insights_diagnostics()'));
assert.equal(diagnostics.live_available,true);assert.equal(diagnostics.connections[0].mode,'mock');assert(diagnostics.connections[0].last_completed_at);assert(diagnostics.runs.every(run=>'next_attempt_at' in run&&run.mode==='mock'));
console.log(`PASS stateful 113→114: next_attempt_at backfilled, ${tables.length} table hashes unchanged, completed snapshot reported, partial run retryable/claimable, job inactive, grants/policies/triggers/other bodies unchanged`);

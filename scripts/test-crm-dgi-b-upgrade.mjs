// Local synthetic 114→115 stateful upgrade (DGI-B-r1 Release B1). Run after
// `supabase db reset --local --version 114 --no-seed`: builds Meta intake and Insights
// state under the 114 definitions (a connection with reconciliation enabled, a mapping,
// three attribution rows and a full object chain), applies 115 through the CLI, then
// proves the two columns are NULL on every existing row, the replaced constraint still
// accepts the stored settings, no row was rewritten, only the enumerated bodies and new
// objects differ, every grant/policy/trigger is unchanged, the switch is off until a
// director enables it, and only the eligible row resolves afterwards.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const sql=input=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:50*1024*1024}).trim();
const last=output=>output.split('\n').at(-1);
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'),'114');
assert.equal(sql('select count(*) from public.crm_submission_attribution'),'0');
const director=randomUUID(),connection=randomUUID();
const as=(who,body)=>last(sql(`begin;set local request.jwt.claim.sub='${who==='service'?'':director}';set local request.jwt.claim.role='${who==='service'?'service_role':'authenticated'}';${body};commit;`));
// 114 state: a Meta connection with reconciliation on (the only settings key 114 allows),
// a mapping, a completed Insights run with a full campaign → ad set → ad chain, and
// three attribution rows that all lack a campaign: before the future switch, after it,
// and a redacted one.
sql(`insert into auth.users(id,email,aud,role) values('${director}','dgi-b-upgrade-${director}@example.invalid','authenticated','authenticated');update profiles set role='director' where id='${director}';`);
as('director',`select crm_save_meta_connection('{"connection_key":"dgi-b-upgrade","page_id":"115501","api_version":"v99.0","access_token_secret_ref":"CRM_META_PAGE_TOKEN_FIXTURE","meta_reconciliation":{"enabled":true,"lookback_minutes":60}}')`);
sql(`update crm_integration_connections set id='${connection}' where connection_key='dgi-b-upgrade'`);
const mapping=as('director',`select crm_publish_meta_form_mapping('${connection}','{"form_key":"115502","form_name":"Programme annuel","field_map":{},"learner_policy":"optional","effective_from":"2020-01-01Z"}')->>'id'`);
as('director',`select crm_configure_insights('${connection}',(select version from crm_integration_connections where id='${connection}'),'{"mode":"mock","enabled":true,"account_id":"1155","currency":"USD","timezone":"Africa/Casablanca","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE","refresh_days":7}')`);
const run=as('director',`select crm_request_insights_sync('${connection}','${randomUUID()}','2026-01-01','2026-01-02')`);
const claim=JSON.parse(as('service','select crm_claim_insights_sync()'));assert.equal(claim.id,run);
as('service',`select crm_finish_insights_sync('${claim.id}','${claim.lease_token}','{"account_id":"1155","currency":"USD","timezone":"Africa/Casablanca","objects":[{"type":"campaign","id":"115511","name":"Upgrade campaign"},{"type":"adset","id":"115512","name":"Upgrade adset","parent_id":"115511"},{"type":"ad","id":"115513","name":"Upgrade ad","parent_id":"115512"}],"rows":[{"date":"2026-01-01","campaign_id":"115511","adset_id":"115512","ad_id":"115513","spend":"5"}]}')`);
assert.equal(sql(`select count(*) from crm_meta_objects where connection_id='${connection}' and ((object_type='ad' and parent_external_id='115512') or (object_type='adset' and parent_external_id='115511') or object_type='campaign')`),'3','full chain stored by the 114 publish path');
const rows={before:"now()-interval '2 days'",after:"now()-interval '1 hour'",redacted:"now()-interval '30 minutes'"};
for(const [key,at] of Object.entries(rows)){
 sql(`with s as (insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
  values('meta_instant_form',${at},${at},'provider','{"contact_name":"Upgrade parent ${key}","phone":"0655${key.length}${key.length}0000","program_interest_text":"Annual","session_type":"Yearly"}','[]','Fixture','needs_review',encode(sha256(convert_to('${key}','UTF8')),'hex'),'${mapping}') returning id)
  insert into crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,form_id,form_name_snapshot,ad_id,provider_created_at,attribution_status,raw_payload)
  select id,'meta','1155${key.length}','page:115501','115501','115502','Programme annuel','115513',${at},'partial','{}'::jsonb from s`);
}
// Redaction needs the outermost lifecycle barrier of migration 103 in the same transaction.
sql(`begin;select crm_security.lifecycle_barrier(true);update crm_submission_attribution set raw_payload=null,redacted_at=now() where external_submission_id='1155${'redacted'.length}';commit;`);
assert.equal(sql('select count(*) from crm_submission_attribution'),'3');
// Catalog fingerprint: everything except the enumerated replaced bodies, the replaced
// constraint, the two new columns and the new objects must be identical.
const replaced=['crm_save_meta_connection','crm_finalize_meta_job','crm_get_meta_diagnostics','crm_get_marketing_cohort'];
const added=['crm_enrich_meta_attribution(integer)','crm_security.attribution_pending_window()','crm_security.attribution_enrichment_started(crm_integration_connections)','crm_security.attribution_enrichment_candidate(crm_submission_attribution,text,uuid)','crm_security.attribution_enrichment_eligible(crm_submission_attribution,text,uuid)','crm_security.attribution_enrichment_expired(crm_submission_attribution,text,uuid)','crm_security.resolve_meta_hierarchy(uuid,text)','crm_security.enrich_attribution_from_objects(uuid,uuid)','crm_security.attribution_diagnostics(crm_integration_connections)'];
const newColumns=['crm_submission_attribution.hierarchy_source','crm_submission_attribution.hierarchy_error_code'];
const catalog=()=>JSON.parse(sql(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(case when n.nspname='public' and p.proname in (${replaced.map(n=>`'${n}'`).join(',')}) then null else md5(p.prosrc) end,p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security','role_security','operational_security','storage_security')),
 'tables',(select jsonb_object_agg(relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
 'columns',(select jsonb_object_agg(table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema='public' and not (table_name||'.'||column_name in (${newColumns.map(c=>`'${c}'`).join(',')}))),
 'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,case when conname='crm_connection_provider_shape' or conname like 'crm_submission_attribution_hierarchy_%' then null else pg_get_constraintdef(oid) end) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_object_agg(indexname,indexdef) from pg_indexes where schemaname='public'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),
 'jobs',(select jsonb_agg(jsonb_build_array(jobname,schedule,command,active) order by jobname) from cron.job))::text`));
const tables=sql("select tablename from pg_tables where schemaname='public' order by tablename").split('\n');
const data=()=>Object.fromEntries(tables.map(table=>{assert(/^[a-z_0-9]+$/.test(table));const columns=table==='crm_submission_attribution'?"to_jsonb(t)-'hierarchy_source'-'hierarchy_error_code'":'to_jsonb(t)';return [table,sql(`select count(*)||':'||md5(coalesce(string_agg((${columns})::text,'' order by (${columns})::text),'')) from public.${table} t`)];}));
const replacedAcl=()=>sql(`select string_agg(p.oid::regprocedure::text||'='||p.proacl::text,',' order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in (${replaced.map(n=>`'${n}'`).join(',')})`);
const before=catalog(),beforeData=data(),beforeAcl=replacedAcl();
for(const name of added)assert(!(name in before.functions),`${name} absent before 115`);
assert(!('crm_submission_attribution.hierarchy_source' in before.columns));
// Apply exactly the reviewed forward migration through the CLI (115 is the last file).
execFileSync('supabase',['migration','up','--local'],{stdio:'pipe'});
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'),'115');
const after=catalog();
for(const name of added){assert(name in after.functions,`${name} created`);delete after.functions[name];}
const constraints=after.constraints;after.constraints=Object.fromEntries(Object.entries(constraints).filter(([key])=>!key.startsWith('crm_submission_attribution.crm_submission_attribution_hierarchy_')));
assert.deepEqual(after,before,'only the enumerated function bodies, the replaced constraint, the new columns and the new objects differ; every grant, policy, trigger, index and job is unchanged');
assert.equal(replacedAcl(),beforeAcl,'replaced functions keep their exact grants');
assert.equal(sql("select proacl::text from pg_proc where oid='public.crm_enrich_meta_attribution(integer)'::regprocedure"),'{postgres=X/postgres,service_role=X/postgres}');
for(const name of added.filter(n=>n.startsWith('crm_security.')))assert.equal(sql(`select proacl::text from pg_proc where oid='${name}'::regprocedure`),'{postgres=X/postgres}',`${name} private`);
assert.match(sql("select pg_get_constraintdef(oid) from pg_constraint where conname='crm_connection_provider_shape'"),/attribution_enrichment/);
assert.equal(sql("select string_agg(column_name||':'||is_nullable||':'||coalesce(column_default,'-'),',' order by column_name) from information_schema.columns where table_name='crm_submission_attribution' and column_name like 'hierarchy_%'"),'hierarchy_error_code:YES:-,hierarchy_source:YES:-');
assert.deepEqual(data(),beforeData,'no existing row rewritten');
assert.equal(sql("select count(*) filter(where hierarchy_source is null and hierarchy_error_code is null)||':'||count(*) from crm_submission_attribution"),'3:3','new columns NULL on every existing row');
assert.equal(sql(`select settings #>> '{meta_reconciliation,enabled}' from crm_integration_connections where id='${connection}'`),'true','stored settings still satisfy the replaced constraint');
assert.equal(sql("select tgenabled from pg_trigger where tgname='crm_attribution_immutable'"),'O','protection trigger untouched');
// Switch off after the migration: the sweep selects nothing and the report shows the
// rows as unknown; the director report keeps working on the 114 snapshot.
assert.equal(as('service','select crm_enrich_meta_attribution()'),'{"expired": 0, "eligible": 0, "resolved": 0, "unresolved": 0}');
let diagnostics=JSON.parse(as('director','select crm_get_meta_diagnostics()'));
let attribution=diagnostics.connections.find(c=>c.id===connection).attribution;
assert.deepEqual(attribution,{enabled:false,started_at:null,pending_max_days:14,eligible_pending:0,oldest_pending_age_hours:null,expired_unknown:0,resolved_from_objects:0,resolved_from_provider:0,lookup_errors:{}});
// Enable through the director command with the full identity and the current version:
// started_at is set by the database and the reconciliation key is kept byte-identical.
const reconciliation=sql(`select settings->'meta_reconciliation' from crm_integration_connections where id='${connection}'`);
as('director',`select crm_save_meta_connection('{"connection_key":"dgi-b-upgrade","page_id":"115501","api_version":"v99.0","access_token_secret_ref":"CRM_META_PAGE_TOKEN_FIXTURE","attribution_enrichment":{"enabled":true}}','${connection}',(select version from crm_integration_connections where id='${connection}'))`);
assert.equal(sql(`select settings->'meta_reconciliation' from crm_integration_connections where id='${connection}'`),reconciliation,'merge keeps meta_reconciliation');
assert.equal(sql(`select (settings #>> '{attribution_enrichment,started_at}')::timestamptz>=now()-interval '1 minute' from crm_integration_connections where id='${connection}'`),'t','database-set started_at');
// Rows created before the switch stay unknown even though their chain exists; the
// "after" row becomes eligible only once the switch precedes it (fixture backdate).
assert.equal(as('service','select crm_enrich_meta_attribution()'),'{"expired": 0, "eligible": 0, "resolved": 0, "unresolved": 0}','nothing before started_at is ever enriched');
sql(`update crm_integration_connections set settings=jsonb_set(settings,'{attribution_enrichment,started_at}',to_jsonb(now()-interval '1 day')) where id='${connection}'`);
assert.equal(as('service','select crm_enrich_meta_attribution()'),'{"expired": 0, "eligible": 1, "resolved": 1, "unresolved": 0}','only the eligible row resolves');
assert.equal(sql(`select external_submission_id||':'||campaign_id||':'||adset_id||':'||campaign_name_snapshot||':'||hierarchy_source||':'||attribution_status from crm_submission_attribution where campaign_id is not null`),`1155${'after'.length}:115511:115512:Upgrade campaign:insights_objects:complete`);
assert.equal(sql("select count(*) from crm_submission_attribution where campaign_id is null and hierarchy_source is null"),'2','before-switch and redacted rows untouched');
diagnostics=JSON.parse(as('director','select crm_get_meta_diagnostics()'));attribution=diagnostics.connections.find(c=>c.id===connection).attribution;
assert.equal(attribution.resolved_from_objects,1);assert.equal(attribution.eligible_pending,0);assert.equal(attribution.enabled,true);
const report=JSON.parse(as('director',`select crm_get_marketing_cohort((now()-interval '3 days')::date,current_date,null,'${connection}')`));
assert.equal(report.summary.leads,0,'fixture submissions carry no opportunity; the report still answers');
assert.equal(report.summary.pending_leads,0);
console.log(`PASS stateful 114→115: ${tables.length} table hashes unchanged, hierarchy columns NULL on existing rows, constraint replaced in place, grants/policies/triggers/other bodies unchanged, switch off until enabled, one eligible row resolved after enabling`);

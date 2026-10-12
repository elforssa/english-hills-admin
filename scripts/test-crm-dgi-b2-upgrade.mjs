// Local synthetic 115→116 stateful upgrade (DGI-B-r1 Release B2). Run after
// `supabase db reset --local --version 115 --no-seed` with the local-only .env.local:
// builds director-report state under the 115 definitions (a Meta connection, mapping,
// completed spend snapshot, three accepted leads with an outreach event), records the
// 115 cohort answers and the previous page's REST call, applies 116 through the CLI,
// then proves: only the cohort signature changed (old dropped, v2 created with the same
// owner, security definer, search path and grants), no row was rewritten, every 115
// answer is reproduced by v2 with only the documented keys added, and the release
// window works both ways (the previous page's call shape succeeds on 116; the new page's
// default call shape succeeds on 115, while the program filter needs 116).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
const sql=input=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:50*1024*1024}).trim();
const last=output=>output.split('\n').at(-1);
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(l=>{const m=l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'),'115');
assert.equal(sql('select count(*) from public.crm_leads'),'0');
const OLD='public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer)';
const NEW='public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer,text)';
// A real local Auth director so PostgREST is exercised exactly like the page.
const email=`dgi-b2-upgrade-${randomUUID()}@example.invalid`,password=randomBytes(20).toString('hex');
const created=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
assert.equal(created.status,200);const director=(await created.json()).id;
sql(`update profiles set role='director' where id='${director}'`);
const session=await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})})).json();
assert(session.access_token);
const rest=async(args,attempts=1)=>{for(let i=0;;i++){const r=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/crm_get_marketing_cohort`,{method:'POST',headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});const body=await r.json();if(r.status===200||i>=attempts-1)return {status:r.status,body};await new Promise(res=>setTimeout(res,500));}};
const as=body=>last(sql(`begin;set local request.jwt.claim.sub='${director}';set local request.jwt.claim.role='authenticated';${body};commit;`));
// 115 state: connection, mapping, completed spend for campaign 116501 over two days,
// three leads (two trusted Meta, one website) and outreach on one of them.
as(`select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}')`);
const connection=JSON.parse(as(`select crm_save_meta_connection('{"connection_key":"dgi-b2-upgrade","page_id":"116501","api_version":"v99.0"}')`)).id;
const mapping=JSON.parse(as(`select crm_publish_meta_form_mapping('${connection}','{"form_key":"116502","field_map":{},"effective_from":"2020-01-01Z"}')`)).id;
as(`select crm_configure_insights('${connection}',(select version from crm_integration_connections where id='${connection}'),'{"mode":"mock","enabled":true,"account_id":"1165","currency":"USD","timezone":"Africa/Casablanca","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE","refresh_days":7}')`);
sql(`with r as (insert into crm_meta_sync_runs(connection_id,request_key,date_from,date_to,config_snapshot,status,completed_at) values('${connection}',gen_random_uuid(),'2026-04-01','2026-04-02','{}','completed',now()) returning id)
 insert into crm_meta_daily_insights(connection_id,sync_run_id,insight_date,account_id,account_timezone,currency,campaign_id,adset_id,ad_id,query_version,spend) select '${connection}',r.id,d::date,'1165','Africa/Casablanca','USD','116501','116502','116503','ad-daily-v1',40 from r,generate_series('2026-04-01'::date,'2026-04-02'::date,interval '1 day') d;
 insert into crm_meta_objects(connection_id,account_id,object_type,external_id,current_name) values('${connection}','1165','campaign','116501','Rehearsal campaign')`);
const leads=[];
for(const [i,channel,session] of [[1,'meta_instant_form','Yearly'],[2,'meta_instant_form',null],[3,'website','Adults']]){
 // Acceptance needs the outermost identity barrier of migration 103 in the same transaction.
 leads.push(as(`select crm_security.lifecycle_barrier(true);with s as (insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
  values('${channel}','2026-04-01 10:00Z','2026-04-01 10:00Z','server','{"contact_name":"Rehearsal parent ${i}","phone":"065116000${i}","learner_name":"Rehearsal child ${i}","program_interest_text":"Annual"${session?`,"session_type":"${session}"`:''}}','[]','Fixture','needs_review',repeat('${i}',64),${channel==='website'?'null':`'${mapping}'`}) returning id),
  a as (insert into crm_submission_attribution(submission_id,provider,campaign_id,adset_id,ad_id,attribution_status) select id,'${channel==='website'?'website':'meta'}',${channel==='website'?'null':"'116501'"},${channel==='website'?'null':"'116502'"},${channel==='website'?'null':"'116503'"},'partial' from s returning submission_id)
  select crm_security.accept_external_submission(submission_id) from a`));
}
as(`select crm_security.event('${leads[0]}','contact_attempted','rehearsal:attempt',null,'phone',null,null,'2026-04-01 12:00Z')`);
// The 115 answers for every existing level and filter shape.
const variants=[`'2026-04-01','2026-04-02',null,'${connection}'`,`'2026-04-01','2026-04-02',null,'${connection}','adset'`,`'2026-04-01','2026-04-02',null,'${connection}','ad'`,`'2026-04-01','2026-04-02',null,'${connection}','source'`,
 `'2026-04-01','2026-04-02','2026-04-01','${connection}'`,`'2026-04-01','2026-04-03',null,'${connection}'`,`'2026-04-01','2026-04-02',null,'${connection}','campaign','116501'`,`'2026-04-01','2026-04-02',null,'${connection}','campaign',null,null,null,'website'`,`'2026-04-01','2026-04-02'`];
const cohort=args=>{const r=JSON.parse(as(`select crm_get_marketing_cohort(${args})`));delete r.outcome_cutoff;return r;};
const before=variants.map(cohort);
assert.equal(before[0].summary.leads,3);assert.equal(Number(before[0].summary.spend),80);
// The previous page's REST call (11 named arguments) and the new page's default call
// (identical: p_session_type is sent only when a program is chosen) both work on 115;
// the program filter and level need 116.
const pageArgs={p_from:'2026-04-01',p_to:'2026-04-02',p_cutoff_date:null,p_connection:connection,p_level:'campaign',p_channel:null,p_campaign:null,p_adset:null,p_ad:null,p_limit:50,p_offset:0};
const restBefore=await rest(pageArgs);assert.equal(restBefore.status,200);assert.equal(restBefore.body.summary.leads,3);
assert.equal((await rest({...pageArgs,p_session_type:'Yearly'})).status,404,'v2 parameter unknown before 116');
assert.equal((await rest({...pageArgs,p_level:'program'})).status,400,'program level unknown before 116');
// Catalog fingerprint: everything except the cohort function must be identical.
const catalog=()=>JSON.parse(sql(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security','role_security','operational_security','storage_security') and p.proname<>'crm_get_marketing_cohort'),
 'tables',(select jsonb_object_agg(relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
 'columns',(select jsonb_object_agg(table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema='public'),
 'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_object_agg(indexname,indexdef) from pg_indexes where schemaname='public'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),
 'jobs',(select jsonb_agg(jsonb_build_array(jobname,schedule,command,active) order by jobname) from cron.job))::text`));
const tables=sql("select tablename from pg_tables where schemaname='public' order by tablename").split('\n');
const data=()=>Object.fromEntries(tables.map(table=>{assert(/^[a-z_0-9]+$/.test(table));return [table,sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.${table} t`)];}));
const signature=name=>sql(`select coalesce((select jsonb_build_array(prosecdef,provolatile,proconfig,proowner::regrole::text,proacl::text)::text from pg_proc where oid=to_regprocedure('${name}')),'absent')`);
const beforeCatalog=catalog(),beforeData=data(),oldSignature=signature(OLD);
assert.notEqual(oldSignature,'absent');assert.equal(signature(NEW),'absent');
// Apply exactly the reviewed forward migration through the CLI (116 is the last file).
execFileSync('supabase',['migration','up','--local'],{stdio:'pipe'});
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'),'116');
assert.deepEqual(catalog(),beforeCatalog,'only the cohort function changed; every other body, grant, policy, trigger, index, constraint, column and job is unchanged');
assert.deepEqual(data(),beforeData,'no existing row rewritten');
assert.equal(signature(OLD),'absent','the 11-parameter signature is dropped');
assert.equal(signature(NEW),oldSignature,'v2 keeps owner, security definer, volatility, search path and the exact grants');
assert.equal(sql("select count(*) from pg_proc where proname='crm_get_marketing_cohort'"),'1');
// Every 115 answer is reproduced by v2; only the documented keys are added.
const added={top:['session_type','spend_suppressed_reason'],summary:['attended_leads','attributed_contacted','booked_leads','contacted','converted_paid','reached'],row:['attended_leads','booked_leads','contacted','converted_paid','reached']};
const strip=r=>{const out={...r};for(const k of added.top){assert(k in out,`top ${k}`);delete out[k];}out.summary={...r.summary};for(const k of added.summary){assert(k in out.summary,`summary ${k}`);delete out.summary[k];}
 out.rows=r.rows.map(row=>{const x={...row};for(const k of added.row){assert(k in x,`row ${k}`);delete x[k];}return x;});return out;};
const after=variants.map(cohort);
after.forEach((r,i)=>{assert.deepEqual(strip(r),before[i],`variant ${i} unchanged apart from the added keys`);assert.equal(r.spend_suppressed_reason,null);assert.equal(r.session_type,null);});
assert.equal(after[0].summary.contacted,1);assert.equal(after[4].summary.contacted,1,'event inside the cutoff');
// Release window: the previous page's call shape works on 116 and answers identically.
const restAfter=await rest(pageArgs,20);assert.equal(restAfter.status,200);
delete restBefore.body.outcome_cutoff;
assert.deepEqual((({outcome_cutoff,...x})=>x)(strip(restAfter.body)),restBefore.body,'previous page answer unchanged on 116');
const filtered=await rest({...pageArgs,p_session_type:'Yearly'});assert.equal(filtered.status,200);
assert.equal(filtered.body.spend_suppressed_reason,'program_filter');assert.equal(filtered.body.summary.leads,1);assert.equal(filtered.body.summary.spend,null);
const program=await rest({...pageArgs,p_level:'program'});assert.equal(program.status,200);assert.equal(program.body.spend_suppressed_reason,'program_level');
assert.deepEqual(program.body.rows.map(r=>r.bucket).sort(),['program:Adults','program:Yearly','program:none']);
assert.equal((await rest({...pageArgs,p_session_type:'yearly'})).status,400,'unknown program refused');
console.log(`PASS stateful 115→116: ${tables.length} table hashes unchanged, catalog unchanged except the cohort signature (old dropped, v2 with identical grants), ${variants.length} cohort answers reproduced with only the documented keys added, previous page call shape works on 116 and the new default call works on 115`);

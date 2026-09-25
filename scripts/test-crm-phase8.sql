-- Synthetic local transaction, always rolled back. No provider/network calls.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(q text,code text default '42501') returns void language plpgsql as $$ begin
 begin execute q;exception when others then if sqlstate=code then return;end if;raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;end;
 raise exception 'Unexpected success: %',q;
end $$;
select pg_temp.ok(not exists(select 1 from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token')),'no external worker kick configured');
insert into auth.users(id,email,aud,role) select ('88000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'phase8-'||i||'@example.invalid','authenticated','authenticated' from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like '88000000-%';
select set_config('request.jwt.claim.sub','88000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temp table fx(k text primary key,v jsonb);
insert into fx values('connection',public.crm_save_meta_connection('{"connection_key":"phase8-test","page_id":"880001","api_version":"v99.0","access_token_secret_ref":"CRM_META_PAGE_TOKEN_TEST"}'));
select pg_temp.ok((select not(v->>'enabled')::boolean from fx where k='connection'),'new connections disabled');
select pg_temp.denied($q$select public.crm_save_meta_connection('{"connection_key":"bad-token","page_id":"1","api_version":"v99.0","access_token":"secret"}')$q$,'22023');
insert into fx values('mapping',public.crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='connection'),'{"form_key":"880002","form_name":"Programme annuel","field_map":{"contact_name":"parent","phone":"phone","learner_name":"child"},"question_labels":{"parent":"Parent"},"default_program_interest_text":"Annual English","default_session_type":"Yearly","effective_from":"2020-01-01Z"}'));
select set_config('request.jwt.claim.sub','',true);select set_config('request.jwt.claim.role','service_role',true);
select public.crm_accept_meta_events('[{"page_id":"880001","leadgen_id":"880003","form_id":"880002","created_time":1700000000}]');
select pg_temp.ok((select status='blocked' from crm_ingestion_jobs),'disabled callback retained durably');
select pg_temp.ok(public.crm_claim_meta_jobs()='[]','disabled jobs not claimed');
select pg_temp.denied('select crm_claim_meta_jobs(null)','22023');
select set_config('request.jwt.claim.sub','88000000-0000-0000-0000-000000000001',true);select set_config('request.jwt.claim.role','authenticated',true);
select public.crm_save_meta_connection((select v||'{"enabled":true}' from fx where k='connection')-array['id','provider','settings','version','created_at','updated_at','created_by','updated_by'],(select (v->>'id')::uuid from fx where k='connection'),1);
select public.crm_retry_meta_job((select id from crm_ingestion_jobs));
select set_config('request.jwt.claim.sub','',true);select set_config('request.jwt.claim.role','service_role',true);
insert into fx values('claim',public.crm_claim_meta_jobs());
select pg_temp.ok(jsonb_array_length((select v from fx where k='claim'))=1,'claim once');
select pg_temp.ok(public.crm_claim_meta_jobs()='[]','active lease excluded');
select pg_temp.denied($q$select public.crm_fail_meta_job((select id from crm_ingestion_jobs),gen_random_uuid(),'network')$q$,'40001');
create function pg_temp.payload(external_id text,learner text default 'Adam',program text default 'Annual English',happened timestamptz default now()) returns jsonb language sql as $$
 select jsonb_build_object('occurred_at',happened,'core_fields',jsonb_build_object('contact_name','Sara','phone','0612345678','learner_name',learner,'program_interest_text',program,'session_type','Yearly'),
 'form_answers','[{"key":"parent","label":"Parent","value":"Sara","value_type":"string","label_source":"mapping"}]'::jsonb,'source_label','Meta • Programme annuel',
 'attribution',jsonb_build_object('external_submission_id',external_id,'page_id','880001','form_id','880002','form_name_snapshot','Programme annuel','ad_id','999999999999999999','attribution_status','partial','raw_payload','{}'::jsonb))
$$;
select public.crm_finalize_meta_job((select id from crm_ingestion_jobs),(select lease_token from crm_ingestion_jobs),(select (v->>'id')::uuid from fx where k='mapping'),pg_temp.payload('880003'));
select pg_temp.ok((select status='blocked' and last_error_code='missing_policy' and submission_id is not null from crm_ingestion_jobs),'missing policy preserves submission and job');
select pg_temp.ok((select count(*)=0 from crm_leads),'no empty lead without policy');
select set_config('request.jwt.claim.sub','88000000-0000-0000-0000-000000000001',true);select set_config('request.jwt.claim.role','authenticated',true);
select public.crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
select public.crm_retry_meta_job((select id from crm_ingestion_jobs));
select set_config('request.jwt.claim.sub','',true);select set_config('request.jwt.claim.role','service_role',true);
select public.crm_claim_meta_jobs();
select public.crm_finalize_meta_job((select id from crm_ingestion_jobs),(select lease_token from crm_ingestion_jobs),(select (v->>'id')::uuid from fx where k='mapping'),pg_temp.payload('880003','CHANGED MUST NOT REINTERPRET'));
select pg_temp.ok((select count(*)=1 from crm_leads where learner_name='Adam' and owner_id is null),'retry creates one lead from frozen evidence');
select pg_temp.ok((select count(*)=1 from crm_tasks where task_type='first_contact'),'exactly one first-contact task');
select pg_temp.ok((select bool_and(due_at=crm_security.next_window(policy_id,due_at)) from crm_tasks),'task inside calling windows');
select pg_temp.ok((select count(*)=1 from crm_submission_attribution where ad_id='999999999999999999'),'text provider IDs');
create function pg_temp.ingest(external_id text,learner text default 'Adam',program text default 'Annual English',happened timestamptz default now()) returns jsonb language plpgsql as $$ declare j crm_ingestion_jobs;r jsonb;begin
 perform public.crm_accept_meta_events(jsonb_build_array(jsonb_build_object('page_id','880001','leadgen_id',external_id,'form_id','880002','created_time',1700000000)));
 perform public.crm_claim_meta_jobs();select * into j from crm_ingestion_jobs where external_key='880001:'||external_id;
 return public.crm_finalize_meta_job(j.id,j.lease_token,(select (v->>'id')::uuid from fx where k='mapping'),pg_temp.payload(external_id,learner,program,happened));
end $$;
select pg_temp.ingest('880004','Adam','Annual English',now()+interval '1 second');
select pg_temp.ok((select count(*)=1 from crm_leads),'repeat active opportunity reused');
select pg_temp.ok((select count(*)=1 from crm_tasks),'no duplicate first contact');
select pg_temp.ok((select first_submission_id<>latest_submission_id from crm_leads),'first and latest differ');
insert into fx select 'latest',to_jsonb(latest_submission_id) from crm_leads;
select pg_temp.ingest('880005','Adam','Annual English',now()-interval '1 day');
select pg_temp.ok((select to_jsonb(latest_submission_id)=(select v from fx where k='latest') from crm_leads),'older callback never replaces latest');
select pg_temp.ingest('880006','Lina');select pg_temp.ingest('880007','Adam','Summer');
select pg_temp.ok((select count(*)=3 from crm_leads),'siblings/programs separate');
select pg_temp.ok((select count(*)=1 from crm_contacts),'corroborated contact reused');
select pg_temp.ingest('880008',null);
select pg_temp.ok((select count(*)=1 from crm_submissions where match_status='needs_review'),'missing learner preserved for review');
insert into crm_contacts(display_name,contact_kind,phone_e164) values('Other parent','guardian','+212612345678');
select pg_temp.ingest('880009');
select pg_temp.ok((select count(*)=2 from crm_submissions where match_status='needs_review'),'multiple contact candidates review');
-- Exact callback replay ten times adds no jobs/submissions.
do $$ begin for i in 1..10 loop perform public.crm_accept_meta_events('[{"page_id":"880001","leadgen_id":"880003","form_id":"880002","created_time":1700000000}]');end loop;end $$;
select pg_temp.ok((select count(*)=7 from crm_ingestion_jobs),'callback replay exactly one job');
-- Different contact name at a shared family phone must not silently reuse contact.
delete from crm_contacts where display_name='Other parent';
update crm_contacts set display_name='Different guardian' where display_name='Sara';
select pg_temp.ingest('880010');
select pg_temp.ok((select match_status='needs_review' from crm_submissions where id=(select submission_id from crm_ingestion_jobs where external_key='880001:880010')),'shared phone requires name corroboration');
update crm_contacts set display_name='Sara' where display_name='Different guardian';
-- Closed opportunities are historical; an identified later inquiry is new.
update crm_leads set status='LOST',closed_at=now(),closure_reason='postponed' where learner_name='Lina';
select pg_temp.ingest('880011','Lina');
select pg_temp.ok((select count(*)=2 from crm_leads where learner_name='Lina'),'closed inquiry creates new opportunity');
select pg_temp.ok((select count(*)=1 from crm_leads where learner_name='Lina' and status='LOST'),'closed history not reopened');
-- Converted opportunity remains historical; build only synthetic enrollment evidence.
do $$ declare l uuid;student uuid;enrollment uuid;activity uuid;before_center jsonb;begin
 select id into l from crm_leads where learner_name='Adam' and program_interest_text='Summer';
 insert into students(full_name,status,session_type) values('Synthetic converted learner','Prospect','Yearly') returning id into student;
 insert into enrollments(student_id,session_type,school_year,status,level) values(student,'Yearly','2026/2027','Confirmed','Child 2') returning id into enrollment;
 insert into crm_activities(lead_id,occurred_at,actor_kind,event_type,source_key,enrollment_id) values(l,now(),'system','lead_converted','phase8-test-conversion',enrollment) returning id into activity;
 update crm_leads set status='CONVERTED',student_id=student,enrollment_id=enrollment,converted_at=now(),conversion_activity_id=activity where id=l;
 select jsonb_build_array((select count(*) from students),(select count(*) from enrollments),(select count(*) from placement_tests),(select count(*) from charges),(select count(*) from receipts),(select count(*) from financial_events)) into before_center;
 perform pg_temp.ingest('880013','Adam','Summer');
 perform pg_temp.ok((select count(*)=2 from crm_leads where learner_name='Adam' and program_interest_text='Summer'),'converted inquiry creates separate new opportunity');
 perform pg_temp.ok((select status='CONVERTED' from crm_leads where id=l),'conversion evidence unchanged');
 perform pg_temp.ok(before_center=jsonb_build_array((select count(*) from students),(select count(*) from enrollments),(select count(*) from placement_tests),(select count(*) from charges),(select count(*) from receipts),(select count(*) from financial_events)),'ingestion has no center side effects');
end $$;
-- Lease expiry/retry/backoff and permanent/configuration states.
select public.crm_accept_meta_events('[{"page_id":"880001","leadgen_id":"880012","form_id":"880002","created_time":1700000000}]');
select public.crm_claim_meta_jobs();
select public.crm_fail_meta_job(id,lease_token,'rate_limit') from crm_ingestion_jobs where external_key='880001:880012';
select pg_temp.ok((select status='retry' and next_attempt_at>now() and lease_token is null from crm_ingestion_jobs where external_key='880001:880012'),'rate limit backoff');
select pg_temp.ok(public.crm_claim_meta_jobs()='[]','not due retry excluded');
update crm_ingestion_jobs set next_attempt_at=now() where external_key='880001:880012';select public.crm_claim_meta_jobs();
select public.crm_fail_meta_job(id,lease_token,'provider_auth') from crm_ingestion_jobs where external_key='880001:880012';
select pg_temp.ok((select status='blocked' from crm_ingestion_jobs where external_key='880001:880012'),'auth blocks without empty lead');
-- A completed job cannot be retried and mappings retain their interpretation.
select set_config('request.jwt.claim.sub','88000000-0000-0000-0000-000000000001',true);select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.denied($q$select crm_retry_meta_job((select id from crm_ingestion_jobs where external_key='880001:880003'))$q$,'22023');
select public.crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='connection'),'{"form_key":"880002","field_map":{"contact_name":"guardian_name"},"effective_from":"2026-09-01Z"}');
select public.crm_retry_meta_job((select id from crm_ingestion_jobs where external_key='880001:880012'));
select set_config('request.jwt.claim.sub','',true);select set_config('request.jwt.claim.role','service_role',true);select public.crm_claim_meta_jobs();
select pg_temp.ok((select (crm_get_meta_job_mapping(id,lease_token,'880002','2025-01-01Z')->>'version')::integer=1 from crm_ingestion_jobs where external_key='880001:880012'),'older event uses old mapping');
select pg_temp.ok((select (crm_get_meta_job_mapping(id,lease_token,'880002','2026-09-02Z')->>'version')::integer=2 from crm_ingestion_jobs where external_key='880001:880012'),'new event uses new mapping');
select public.crm_fail_meta_job(id,lease_token,'invalid_provider_data') from crm_ingestion_jobs where external_key='880001:880012';
select pg_temp.ok((select status='dead' from crm_ingestion_jobs where external_key='880001:880012'),'permanent malformed data stops retry');
-- Role matrix and safe operational review.
do $$ declare i integer;role_name text;begin
 for i in 1..7 loop
  perform set_config('request.jwt.claim.sub','88000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  if i=1 then perform public.crm_get_meta_diagnostics();else perform pg_temp.denied('select public.crm_get_meta_diagnostics()');end if;
  if i<=3 then perform pg_temp.ok(public.crm_list_intake_review()::text not like '%999999999999999999%','review no attribution');else perform pg_temp.denied('select public.crm_list_intake_review()');end if;
  perform pg_temp.denied('select public.crm_claim_meta_jobs()');
 end loop;
end $$;
select set_config('request.jwt.claim.sub','88000000-0000-0000-0000-000000000003',true);
do $$ declare s uuid;result jsonb;request uuid:=gen_random_uuid();begin
 select id into s from crm_submissions where match_status='needs_review' order by received_at,id limit 1;
 result:=public.crm_resolve_meta_intake(request,s,'new','{"contact_name":"Verified guardian","learner_name":"Verified child","program_interest_text":"Annual"}');
 perform pg_temp.ok(public.crm_resolve_meta_intake(request,s,'new','{"contact_name":"Verified guardian","learner_name":"Verified child","program_interest_text":"Annual"}')=result,'operational resolution idempotent');
 perform pg_temp.denied(format('select public.crm_resolve_meta_intake(gen_random_uuid(),%L,''reject'')',s),'40001');
end $$;
select pg_temp.ok(not exists(select 1 from pg_class where relname in ('crm_integration_connections','crm_ingestion_jobs','crm_form_mappings') and not relrowsecurity),'RLS enabled');
select pg_temp.ok(not exists(select 1 from information_schema.role_table_grants where table_name in ('crm_integration_connections','crm_ingestion_jobs','crm_form_mappings') and grantee in ('anon','authenticated','service_role')),'no direct table grants');
select pg_temp.ok(not has_function_privilege('authenticated','public.crm_finalize_meta_job(uuid,uuid,uuid,jsonb)','execute'),'worker unavailable to browser');
select pg_temp.ok(not has_function_privilege('anon','public.crm_accept_meta_events(jsonb)','execute'),'anon cannot forge intake');
select pg_temp.denied($q$update crm_form_mappings set form_name='changed'$q$);
set constraints all immediate;
select pg_temp.denied($q$truncate crm_form_mappings cascade$q$);
set constraints all immediate;
rollback;
\echo PASS Phase 8 SQL

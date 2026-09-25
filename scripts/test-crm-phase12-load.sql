-- Disposable phase12_fresh ONLY. Synthetic bulk data; guards remain enabled.
\set ON_ERROR_STOP on
select current_database()='phase12_fresh' as disposable \gset
\if :disposable
\else
\quit 3
\endif
begin;
insert into auth.users(id,email,aud,role) values('8c000000-0000-0000-0000-000000000001','phase12-load@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='8c000000-0000-0000-0000-000000000001';
set local request.jwt.claim.sub='8c000000-0000-0000-0000-000000000001';
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]}}');
create temp table parents as select i,gen_random_uuid() id from generate_series(1,5000)i;
create temp table fixture as select i,gen_random_uuid() lead,gen_random_uuid() first_touch,gen_random_uuid() last_touch,gen_random_uuid() student,gen_random_uuid() enrollment from generate_series(1,10000)i;
insert into crm_contacts(id,contact_kind,display_name,phone_e164,created_by) select id,'guardian','Synthetic parent '||i,'+2126'||lpad(i::text,8,'0'),auth.uid() from parents;
insert into students(id,full_name,status,session_type) select student,'Synthetic learner '||i,'Prospect','Yearly' from fixture where i<=3000;
insert into enrollments(id,student_id,status,session_type,school_year,level) select enrollment,student,'Submitted','Yearly','2026/2027','Child 2' from fixture where i<=3000;
insert into crm_leads(id,contact_id,learner_name,learner_name_normalized,session_type,program_interest_text,status,first_submission_id,latest_submission_id,followup_policy_id,created_at,student_id,enrollment_id)
select f.lead,p.id,'Synthetic learner '||f.i,'synthetic learner '||f.i,'Yearly','Annual',case when f.i<=3000 then 'QUALIFIED' else 'NEW' end,f.first_touch,f.last_touch,(select id from crm_followup_policies),now()-interval '10 days',case when f.i<=3000 then f.student end,case when f.i<=3000 then f.enrollment end from fixture f join parents p on p.i=(f.i+1)/2;
insert into crm_submissions(id,lead_id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,resolved_at,resolved_by)
select first_touch,lead,'manual',now()-interval '10 days',now()-interval '10 days','server','{}'::jsonb,'[]'::jsonb,'Synthetic bulk','resolved',repeat('a',64),now(),auth.uid() from fixture
union all select last_touch,lead,'website',now()-interval '1 day',now()-interval '1 day','server','{}'::jsonb,'[]'::jsonb,'Synthetic later touch','resolved',repeat('b',64),now(),auth.uid() from fixture;
insert into crm_submission_attribution(submission_id,provider,attribution_status) select first_touch,'manual','unavailable' from fixture union all select last_touch,'website','partial' from fixture;
insert into crm_activities(lead_id,occurred_at,actor_kind,event_type,body,source_key)
select f.lead,now()-make_interval(days=>g),'system',case when f.i<=3000 and g=1 then 'lead_qualified' when f.i<=3000 and g=2 then 'lead_engaged' else 'note_added' end,'Synthetic load fixture',f.lead||':load:'||g from fixture f cross join generate_series(1,5)g;
insert into crm_tasks(lead_id,task_type,due_at,source_kind,source_key,status,cancelled_at,cancellation_reason)
select f.lead,case when f.i<=3000 then 'enrollment_followup' else 'first_contact' end,now()-make_interval(days=>g),'manual',f.lead||':task:'||g,case when g=0 then 'open' else 'cancelled' end,case when g>0 then now()-interval '1 day' end,case when g>0 then 'Synthetic historical cancellation' end from fixture f cross join generate_series(0,4)g;
insert into placement_tests(student_id,student_name,date_test,heure,status,crm_lead_id,niveau_recommande) select student,'Synthetic learner '||i,current_date-1,'10:30','Résultat saisi',lead,'A2' from fixture where i<=3000;
-- Use the real financial RPC: conversion/revenue triggers produce trusted evidence.
do $$ declare f record;begin
 for f in select * from fixture where i<=3000 loop
  perform create_charge_payment(jsonb_build_object('student_id',f.student,'enrollment_id',f.enrollment,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1500,'payment_amount',1500,'payment_method','Espèces','idempotency_key',gen_random_uuid()));
 end loop;
end $$;
commit;
-- Advertising and unresolved-intake workload (all synthetic and disabled).
begin;
set local request.jwt.claim.sub='8c000000-0000-0000-0000-000000000001';
insert into crm_integration_connections(id,connection_key,page_id,api_version,created_by,updated_by,insights_settings) values('8c000000-0000-0000-0000-000000000020','phase12-load-meta','120000','v99.0',auth.uid(),auth.uid(),'{"mode":"mock","enabled":false,"account_id":"120000","currency":"MAD","timezone":"America/New_York","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE"}');
insert into crm_meta_sync_runs(id,connection_id,request_key,date_from,date_to,config_snapshot,status,completed_at) values('8c000000-0000-0000-0000-000000000021','8c000000-0000-0000-0000-000000000020',gen_random_uuid(),current_date-30,current_date,'{}','completed',now());
insert into crm_meta_objects(connection_id,account_id,object_type,external_id,current_name) select '8c000000-0000-0000-0000-000000000020','120000','campaign',(120100+i)::text,'Synthetic campaign '||i from generate_series(0,9)i;
insert into crm_meta_daily_insights(connection_id,sync_run_id,insight_date,account_id,account_timezone,currency,campaign_id,adset_id,ad_id,query_version,spend)
select '8c000000-0000-0000-0000-000000000020','8c000000-0000-0000-0000-000000000021',current_date-d,'120000','America/New_York','MAD',(120100+(a%10))::text,(120200+(a%20))::text,(121000+a)::text,'ad-daily-v1',10 from generate_series(0,30)d cross join generate_series(0,99)a;
insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash) select 'meta_instant_form',now(),now(),'server','{}','[]','Synthetic unresolved','needs_review',repeat('e',64) from generate_series(1,1000);
commit;
do $$ declare t record;begin for t in select tablename from pg_tables where schemaname='public' loop execute format('analyze public.%I',t.tablename);end loop;end $$;

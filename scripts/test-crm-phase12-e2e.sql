-- Integrated durable intake -> placement/enrollment -> revenue -> reporting.
-- Synthetic only; all writes roll back. No provider HTTP or guard disabling.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
select pg_temp.ok(not exists(select 1 from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token','receipt_webhook_url','receipt_webhook_token')),'no outbound wake-ups');
insert into auth.users(id,email,aud,role) values('8c000000-0000-0000-0000-000000000011','phase12-e2e@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='8c000000-0000-0000-0000-000000000011';
create function pg_temp.actor(worker boolean default false) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',case when worker then '' else '8c000000-0000-0000-0000-000000000011' end,true);perform set_config('request.jwt.claim.role',case when worker then 'service_role' else 'authenticated' end,true);end $$;
select pg_temp.actor();
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]}}');
create temp table fx(k text primary key,v jsonb);
insert into fx values('meta',crm_save_meta_connection('{"connection_key":"phase12-meta","page_id":"12001","api_version":"v99.0"}')),('site',crm_save_website_connection('{"connection_key":"phase12-site","origin":"https://school.example"}'));
update crm_integration_connections set enabled=true where connection_key like 'phase12-%';
insert into fx values('mm',crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='meta'),'{"form_key":"12002","field_map":{},"effective_from":"2020-01-01Z"}')),('wm',crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"annual","field_map":{},"effective_from":"2020-01-01Z"}'));
select crm_configure_lifecycle((select (v->>'id')::uuid from fx where k='meta'),1,'{"mode":"mock","enabled":true,"dataset_id":"12003","api_version":"v99.0","secret_ref":"CRM_META_LIFECYCLE_TOKEN_FIXTURE","events":{"qualified":"FixtureQualified","converted":"FixtureConverted"},"action_source":"system_generated","allow_later_meta":true,"max_attempts":3}');
-- Fixture transaction now() precedes config clock_timestamp; mimic a prior config.
update crm_integration_connections set lifecycle_settings=jsonb_set(lifecycle_settings,'{not_before}',to_jsonb(now()-interval '1 second')) where connection_key='phase12-meta';
select pg_temp.actor(true);
select crm_accept_meta_events('[{"page_id":"12001","leadgen_id":"12004","form_id":"12002","created_time":1700000000}]');
select crm_accept_meta_events('[{"page_id":"12001","leadgen_id":"12004","form_id":"12002","created_time":1700000000}]');
insert into fx values('web-request',to_jsonb(gen_random_uuid()));
select crm_accept_website_inquiry('phase12-site','annual',(v#>>'{}')::uuid,'{"form_key":"annual","contact":{"name":"Website parent","phone":"0612345002"},"answers":{"child":"Website learner"},"attribution":{"utm_source":"facebook","utm_campaign":"Campaign A","fbc":"fb.fixture","fbp":"fb.fixture"},"consent":true}') from fx where k='web-request';
select crm_accept_website_inquiry('phase12-site','annual',(v#>>'{}')::uuid,'{"form_key":"annual","contact":{"name":"Website parent","phone":"0612345002"},"answers":{"child":"Website learner"},"attribution":{"utm_source":"facebook","utm_campaign":"Campaign A","fbc":"fb.fixture","fbp":"fb.fixture"},"consent":true}') from fx where k='web-request';
do $$ declare j jsonb;r jsonb;d jsonb;begin
 for j in select value from jsonb_array_elements(crm_claim_ingestion_jobs(10)) loop
  if j->'connection'->>'provider'='website' then
   d:='{"core_fields":{"contact_name":"Website parent","phone":"0612345002","learner_name":"Website learner","program_interest_text":"Annual","session_type":"Yearly"},"form_answers":[],"source_label":"Site web"}';
   r:=crm_finalize_website_job((j->>'id')::uuid,(j->>'lease_token')::uuid,(select (v->>'id')::uuid from fx where k='wm'),d);insert into fx values('website',r);
  else
   d:=jsonb_build_object('occurred_at',now(),'core_fields','{"contact_name":"Meta parent","phone":"0612345001","learner_name":"Meta learner","program_interest_text":"Annual","session_type":"Yearly"}'::jsonb,'form_answers','[]'::jsonb,'source_label','Meta','attribution','{"external_submission_id":"12004","page_id":"12001","form_id":"12002","campaign_id":"12101","adset_id":"12102","ad_id":"12103","attribution_status":"complete","consent_evidence":{"adult_contact":true,"meta_lifecycle_sharing":true}}'::jsonb);
   r:=crm_finalize_meta_job((j->>'id')::uuid,(j->>'lease_token')::uuid,(select (v->>'id')::uuid from fx where k='mm'),d);insert into fx values('meta-lead',r);
  end if;
 end loop;
end $$;
select pg_temp.ok((select count(*)=2 from crm_submissions),'durable webhook/site replay creates exactly two submissions');
select pg_temp.ok((select count(*)=2 from crm_tasks where task_type='first_contact'),'one first-contact task each');
select pg_temp.ok((select count(*)=0 from students where full_name in ('Meta learner','Website learner')),'no student at intake');
select pg_temp.actor();
create function pg_temp.act(cmd text,l uuid,data jsonb) returns jsonb language plpgsql as $$ declare r jsonb;begin execute format('select crm_%I($1,$2)',cmd) into r using gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l))||data;return r;end $$;
insert into fx values('manual',crm_create_manual_lead(gen_random_uuid(),'{"display_name":"Manual parent","learner_name":"Manual learner","phone":"0612345003","source_label":"Phone"}'));
-- All integrations can be disabled while manual operational commands keep working.
update crm_integration_connections set enabled=false,lifecycle_settings=case when provider='meta' then jsonb_set(lifecycle_settings,'{enabled}','false') else lifecycle_settings end;
do $$ declare l uuid:=(select (v->'lead'->>'id')::uuid from fx where k='manual');begin
 update crm_leads set created_at=now()-interval '3 days' where id=l;
 perform pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','no_answer','occurred_at',now()-interval '2 days'));
 perform pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','busy','occurred_at',now()-interval '1 day'));
 perform pg_temp.ok((select status='CONTACTING' and crm_security.failed_count(crm_leads)=2 from crm_leads where id=l),'two failed attempts, no automatic Lost');
 perform pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','spoke_with_contact','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')));
 perform pg_temp.ok((select status='ENGAGED' from crm_leads where id=l),'meaningful conversation engages');
 perform pg_temp.act('qualify_lead',l,jsonb_build_object('conversation_channel','phone','note','Needs a test','qualification_step','placement_test','next_task',jsonb_build_object('task_type','confirm_placement_test','due_at',now()+interval '1 day')));
end $$;
-- Placement booking, same-row reschedule, attendance and result.
do $$ declare l uuid:=(select (v->'lead'->>'id')::uuid from fx where k='manual');p uuid;r jsonb;begin
 r:=crm_book_placement_test(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l),'date_test',current_date+2,'heure','10:30','examinateur','Fixture','task_id',(select id from crm_tasks where lead_id=l and task_type='confirm_placement_test' and status='open'),'expected_task_version',(select version from crm_tasks where lead_id=l and task_type='confirm_placement_test' and status='open')));p:=(r->'placement'->>'id')::uuid;
 update placement_tests set date_test=date_test+1,heure='11:30' where id=p;
 update placement_tests set status='Passé' where id=p;
 update placement_tests set status='Résultat saisi',niveau_recommande='A2',score=75 where id=p;
 perform pg_temp.ok((select count(*)=1 from placement_tests where crm_lead_id=l),'one placement');
 perform pg_temp.ok((select count(*)=1 from crm_activities where lead_id=l and event_type='placement_test_attended') and (select count(*)=1 from crm_activities where lead_id=l and event_type='placement_result_entered'),'one attendance/result');
 perform pg_temp.ok((select count(*)=1 from crm_tasks where lead_id=l and status='open' and task_type='post_test_followup'),'one result follow-up');
end $$;
-- Website first touch survives a later Meta observation before conversion/payment.
do $$ declare l uuid:=(select (v->>'lead_id')::uuid from fx where k='website');s uuid;first_id uuid;begin
 select first_submission_id into first_id from crm_leads where id=l;
 insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash) values('meta_instant_form',clock_timestamp(),clock_timestamp(),'server','{}','[]','Later Meta','needs_review',repeat('c',64)) returning id into s;
 insert into crm_submission_attribution(submission_id,provider,campaign_id,attribution_status) values(s,'meta','12101','partial');
 perform crm_security.resolve_submission(l,s,(select version from crm_leads where id=l),gen_random_uuid());
 perform pg_temp.ok((select first_submission_id=first_id and latest_submission_id=s from crm_leads where id=l),'website first touch frozen');
end $$;
do $$ declare item record;l uuid;r jsonb;s uuid;e uuid;receipt uuid;name text;before_count int;begin
 for item in select * from fx where k in ('manual','meta-lead','website') order by k loop
  l:=coalesce((item.v->>'lead_id')::uuid,(item.v->'lead'->>'id')::uuid);select learner_name into name from crm_leads where id=l;
  if item.k<>'manual' then perform pg_temp.act('qualify_lead',l,jsonb_build_object('conversation_channel','phone','note','Enrollment','qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));end if;
  r:=crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l),'student_choice','new','learner_name',name,'birth_date','2014-05-10','session_type','Yearly','school_year','2026/2027','level','Child 2','candidate_review',crm_security.candidate_token(l,name,'2014-05-10'),'confirm_new',true));
  s:=(r->'enrollment'->>'student_id')::uuid;e:=(r->'enrollment'->>'id')::uuid;
  perform pg_temp.ok((select status='Submitted' from enrollments where id=e) and (select status='QUALIFIED' from crm_leads where id=l),'Submitted not Converted');
  update enrollments set status='Confirmed' where id=e;
  perform pg_temp.ok((select status='CONVERTED' from crm_leads where id=l),'explicit linked confirmation converts');
  perform pg_temp.ok(not exists(select 1 from crm_revenue_entries where lead_id=l),'converted with zero revenue legitimate');
  r:=create_charge_payment(jsonb_build_object('student_id',s,'enrollment_id',e,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1500,'payment_amount',1500,'payment_method','Espèces','idempotency_key',gen_random_uuid()));receipt:=(r->>'receipt_id')::uuid;
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.ok((select sum(amount_delta)=1500 and bool_and(attribution_submission_id=(select first_submission_id from crm_leads where id=l)) from crm_revenue_entries where lead_id=l),'collected revenue frozen first-touch');
  perform pg_temp.ok((select count(*)=1 from crm_activities where lead_id=l and event_type='lead_converted'),'exactly one trusted conversion');
  if item.k='manual' then
   perform void_financial_receipt(receipt,'Synthetic reversal',gen_random_uuid());set constraints all immediate;set constraints all deferred;
   perform delete_mistaken_receipt(receipt,'Synthetic mistaken receipt',gen_random_uuid());set constraints all immediate;set constraints all deferred;
   perform pg_temp.ok((select sum(amount_delta)=0 and count(*) filter(where amount_delta=0)=1 from crm_revenue_entries where lead_id=l),'1500 -1500 +0, no double subtraction');
   perform pg_temp.ok((select status='CONVERTED' from crm_leads where id=l),'reversal leaves conversion');
  end if;
 end loop;
end $$;
select pg_temp.ok((select count(*)=0 from crm_external_deliveries),'no synchronous provider intentions');
select crm_reconcile_external_deliveries(100);
select crm_reconcile_external_deliveries(100);
select pg_temp.ok((select count(*)=6 from crm_external_deliveries),'one qualified/converted intention per opportunity despite replay');
select pg_temp.ok(not exists(select 1 from crm_external_delivery_attempts),'no real outbound attempts');
select pg_temp.ok(not exists(select 1 from crm_leads l where status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and not exists(select 1 from crm_tasks t where t.lead_id=l.id and t.status='open') and not exists(select 1 from placement_tests p where p.crm_lead_id=l.id and p.status='Planifié') and crm_security.failed_count(l)<5),'no accidental taskless active leads');
select pg_temp.ok(not exists(select 1 from crm_submission_attribution a join crm_submissions s on s.id=a.submission_id where s.channel='website' and (a.campaign_id is not null or a.ad_id is not null)),'website never gains fabricated Meta IDs');
rollback;
\echo 'PASS integrated durable Meta/website and manual journey, external disables, placement, conversion, signed revenue and outbox isolation'

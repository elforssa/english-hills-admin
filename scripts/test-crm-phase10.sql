-- Synthetic local fixtures; all mutations roll back. No HTTP/network configured.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(q text,code text default '42501') returns void language plpgsql as $$ begin
 begin execute q;exception when others then if sqlstate=code then return;end if;raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;end;raise exception 'Unexpected success: %',q;end $$;
select pg_temp.ok(not exists(select 1 from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token','receipt_webhook_url','receipt_webhook_token')),'no external fixture I/O');
insert into auth.users(id,email,aud,role) select ('8a000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'phase10-'||i||'@example.invalid','authenticated','authenticated' from generate_series(1,7)i;
update profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like '8a000000-%';
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',case when i=0 then '' else '8a000000-0000-0000-0000-'||lpad(i::text,12,'0') end,true);
 perform set_config('request.jwt.claim.role',case when i=0 then 'service_role' else 'authenticated' end,true);
end $$;
select pg_temp.actor(1);
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
create temp table fx(k text primary key,v jsonb);
insert into fx values('meta',crm_save_meta_connection('{"connection_key":"phase10-meta","page_id":"100001","api_version":"v99.0"}'));
insert into fx values('site',crm_save_website_connection('{"connection_key":"phase10-site","origin":"https://school.example"}'));
insert into fx values('mm',crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='meta'),'{"form_key":"100002","field_map":{},"effective_from":"2020-01-01Z"}'));
insert into fx values('wm',crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"annual","field_map":{},"effective_from":"2020-01-01Z"}'));
create function pg_temp.config(enabled boolean default true) returns jsonb language sql as $$ select jsonb_build_object('mode','mock','enabled',enabled,'dataset_id','100003','api_version','v99.0','secret_ref','CRM_META_LIFECYCLE_TOKEN_FIXTURE','events',jsonb_build_object('qualified','FixtureQualified','converted','FixtureConverted'),'action_source','system_generated','allow_later_meta',true,'max_attempts',3) $$;
select crm_configure_lifecycle((select (v->>'id')::uuid from fx where k='meta'),1,pg_temp.config());
select crm_configure_lifecycle((select (v->>'id')::uuid from fx where k='site'),1,jsonb_build_object('destination_id',(select v->>'id' from fx where k='meta')));
-- The single test transaction's now() predates configuration's clock_timestamp().
update crm_integration_connections set lifecycle_settings=jsonb_set(lifecycle_settings,'{not_before}',to_jsonb(now()-interval '1 second')) where provider='meta';
select pg_temp.denied($q$select crm_configure_lifecycle((select (v->>'id')::uuid from fx where k='meta'),2,pg_temp.config()||'{"mode":"live"}')$q$,'22023');
create function pg_temp.intake(channel text default 'meta_instant_form',consent boolean default true,identity boolean default true) returns uuid language plpgsql as $$ declare s uuid;l uuid;begin
 if channel='manual' then return (crm_create_manual_lead(gen_random_uuid(),'{"display_name":"Parent fixture","learner_name":"Child private","phone":"0612345678","source_label":"Phone"}')->'lead'->>'id')::uuid;end if;
 insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
 values(channel,now(),now(),'server','{"contact_name":"Parent fixture","phone":"0612345678","email":"parent@example.invalid","learner_name":"CHILD-PRIVATE","learner_age":12,"learner_birth_date":"2014-01-01","program_interest_text":"Annual","session_type":"Yearly"}','[]','Fixture','needs_review',repeat('a',64),(select (v->>'id')::uuid from fx where k=case channel when 'website' then 'wm' else 'mm' end)) returning id into s;
 insert into crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,fbc,fbp,consent_evidence,attribution_status)
 values(s,case channel when 'website' then 'website' else 'meta' end,case when channel='meta_instant_form' and identity then '100009' end,case when channel='meta_instant_form' then 'page:100001:'||s end,case when channel='meta_instant_form' then '100001' end,
 case when channel='website' and identity then 'fb.fixture.click' end,case when channel='website' and identity then 'fb.fixture.browser' end,jsonb_build_object('meta_lifecycle_sharing',consent,'adult_contact',consent),'partial');
 l:=crm_security.accept_external_submission(s);return l;
end $$;
create function pg_temp.act(cmd text,l uuid,data jsonb) returns jsonb language plpgsql as $$ declare r jsonb;begin
 execute format('select crm_%I($1,$2)',cmd) into r using gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l))||data;return r;
end $$;
create function pg_temp.qualify(l uuid) returns void language plpgsql as $$ begin
 perform pg_temp.act('qualify_lead',l,jsonb_build_object('conversation_channel','phone','note','PRIVATE-NOTE','qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));
end $$;
create function pg_temp.enroll(l uuid) returns uuid language plpgsql as $$ declare r jsonb;begin
 r:=crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l),'student_choice','new','learner_name','Phase10 child','birth_date','2014-05-10','session_type','Yearly','school_year','2026/2027','level','Child 2','candidate_review',crm_security.candidate_token(l,'Phase10 child','2014-05-10'),'confirm_new',true));return (r->'enrollment'->>'id')::uuid;
end $$;
select pg_temp.actor(3);
insert into fx values('lead',to_jsonb(pg_temp.intake()));
select pg_temp.qualify((select (v#>>'{}')::uuid from fx where k='lead'));
select pg_temp.ok((select count(*)=0 from crm_external_deliveries),'CRM transaction never creates/sends outbound synchronously');
select pg_temp.actor(0);select crm_reconcile_external_deliveries();select crm_reconcile_external_deliveries();
select pg_temp.ok((select count(*)=1 and bool_and(status='pending') from crm_external_deliveries),'one qualified intention from trusted activity');
select pg_temp.actor(3);
select pg_temp.act('close_lost',(select (v#>>'{}')::uuid from fx where k='lead'),'{"reason":"postponed","note":"Later"}');
select pg_temp.act('reopen_lead',(select (v#>>'{}')::uuid from fx where k='lead'),jsonb_build_object('reason','Asked again','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')));
select pg_temp.qualify((select (v#>>'{}')::uuid from fx where k='lead'));
select pg_temp.actor(0);select crm_reconcile_external_deliveries();
select pg_temp.ok((select count(*)=1 from crm_external_deliveries),'requalification never creates a second signal');
-- Freeze, attempt, uncertain response, retry identity and immutable attempt history.
select crm_claim_external_deliveries();
insert into fx select 'delivery',to_jsonb(d) from crm_external_deliveries d;
insert into fx select 'worker',crm_get_external_delivery(id,lease_token) from crm_external_deliveries;
select pg_temp.ok((select v::text not like '%CHILD-PRIVATE%' and v::text not like '%PRIVATE-NOTE%' and not(v->'matching' ? 'learner_birth_date') from fx where k='worker'),'worker only receives adult/contact match allowlist');
create function pg_temp.payload(d crm_external_deliveries) returns jsonb language sql as $$ select jsonb_build_object('data',jsonb_build_array(jsonb_build_object('event_name',d.mapping_snapshot->'events'->>d.event_kind,'event_id',d.provider_event_id,'event_time',floor(extract(epoch from d.event_time))::bigint,'action_source','system_generated','user_data',jsonb_build_object('lead_id',(select external_submission_id from crm_submission_attribution where submission_id=d.matching_submission_id))))) $$;
select crm_prepare_external_delivery(id,lease_token,pg_temp.payload(d)) from crm_external_deliveries d;
select pg_temp.denied($q$select crm_prepare_external_delivery(id,lease_token,jsonb_set(pg_temp.payload(d),'{data,0,user_data,learner_age}','12')) from crm_external_deliveries d$q$,'22023');
select pg_temp.denied($q$select crm_prepare_external_delivery(id,lease_token,jsonb_set(pg_temp.payload(d),'{data,0,user_data,em}',jsonb_build_array(repeat('b',64)))) from crm_external_deliveries d$q$,'22023');
select crm_begin_external_attempt(id,lease_token) from crm_external_deliveries;
select pg_temp.denied($q$select crm_begin_external_attempt(id,lease_token) from crm_external_deliveries$q$,'40001');
select crm_finish_external_attempt(id,lease_token,'{"outcome":"unknown","error_code":"timeout"}') from crm_external_deliveries;
select pg_temp.ok((select status='unknown' and next_attempt_at>now() and attempt_count=1 from crm_external_deliveries),'uncertainty visible with bounded retry');
select pg_temp.denied($q$update crm_external_delivery_attempts set error_code='changed'$q$);
select pg_temp.actor(1);
select crm_configure_lifecycle((select (v->>'id')::uuid from fx where k='meta'),2,jsonb_set(pg_temp.config(),'{events,qualified}','"FutureQualified"'));
select crm_retry_external_delivery(id) from crm_external_deliveries;
select pg_temp.actor(0);select crm_claim_external_deliveries();
select pg_temp.ok((select payload->'data'->0->>'event_name'='FixtureQualified' and mapping_version=1 from crm_external_deliveries),'config change never mutates prepared event');
select crm_begin_external_attempt(id,lease_token) from crm_external_deliveries;
select crm_finish_external_attempt(id,lease_token,'{"outcome":"sent","http_status":200,"request_id":"safe_trace"}') from crm_external_deliveries;
select pg_temp.actor(1);select pg_temp.denied($q$select crm_retry_external_delivery(id) from crm_external_deliveries$q$,'22023');
select pg_temp.ok((select count(*)=2 from crm_external_delivery_attempts),'numbered immutable attempts');
-- Genuine linked enrollment conversion and Confirmed -> Validated never duplicate.
select pg_temp.actor(3);insert into fx values('enrollment',to_jsonb(pg_temp.enroll((select (v#>>'{}')::uuid from fx where k='lead'))));
select pg_temp.actor(1);update enrollments set status='Confirmed' where id=(select (v#>>'{}')::uuid from fx where k='enrollment');
set constraints all immediate;set constraints all deferred;
select crm_reconcile_external_deliveries();
insert into groups(id,name,session_type,niveau) values('8a000000-0000-0000-0000-000000000100','Phase10 fixture','Yearly','Child 2');
update enrollments set group_id='8a000000-0000-0000-0000-000000000100',status='Validated' where id=(select (v#>>'{}')::uuid from fx where k='enrollment');
set constraints all immediate;set constraints all deferred;
select crm_reconcile_external_deliveries();
select pg_temp.ok((select count(*)=1 from crm_external_deliveries where event_kind='converted'),'one conversion delivery from trusted linked confirmation');
-- Manual, no identity, missing consent, website and review-required paths.
select pg_temp.actor(3);
insert into fx values('manual',to_jsonb(pg_temp.intake('manual'))),('website',to_jsonb(pg_temp.intake('website'))),('noidentity',to_jsonb(pg_temp.intake('website',true,false))),('noconsent',to_jsonb(pg_temp.intake('meta_instant_form',false))),('review',to_jsonb(pg_temp.intake()));
select pg_temp.qualify((v#>>'{}')::uuid) from fx where k in ('manual','website','noidentity','noconsent','review');
insert into fx values('manual_enrollment',to_jsonb(pg_temp.enroll((select (v#>>'{}')::uuid from fx where k='manual'))));
insert into fx values('review_enrollment',to_jsonb(pg_temp.enroll((select (v#>>'{}')::uuid from fx where k='review'))));
select pg_temp.act('close_lost',(select (v#>>'{}')::uuid from fx where k='review'),'{"reason":"postponed","note":"Wait"}');
select pg_temp.actor(1);update enrollments set status='Confirmed' where id in(select (v#>>'{}')::uuid from fx where k in ('review_enrollment','manual_enrollment'));
set constraints all immediate;set constraints all deferred;
select crm_reconcile_external_deliveries();
select pg_temp.ok((select count(*)=2 and bool_and(status='suppressed' and last_error_code='no_destination') from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='manual')),'manual qualification and conversion have no fabricated destination');
select pg_temp.ok((select status='suppressed' and last_error_code='no_matching_identity' from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='noidentity')),'website without matching observations suppressed');
select pg_temp.ok((select status='blocked' and last_error_code='sharing_evidence_missing' from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='noconsent')),'generic inquiry consent not treated as provider sharing permission');
select pg_temp.ok((select status='blocked' and last_error_code='conversion_review_required' from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='review') and event_kind='converted'),'questionable conversion held');
select pg_temp.ok((select status='pending' and attribution_submission_id=matching_submission_id from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='website')),'explicit website destination uses observed identity');
-- Disable does not fail CRM and cannot auto-release previously blocked rows.
select crm_configure_lifecycle((select (v->>'id')::uuid from fx where k='meta'),3,pg_temp.config(false));
select pg_temp.actor(3);insert into fx values('disabled',to_jsonb(pg_temp.intake()));select pg_temp.qualify((select (v#>>'{}')::uuid from fx where k='disabled'));
select pg_temp.actor(1);select crm_reconcile_external_deliveries();
select pg_temp.ok((select status='blocked' and last_error_code='outbound_disabled' from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='disabled')),'disabled outbound does not block qualification');
select crm_configure_lifecycle((select (v->>'id')::uuid from fx where k='meta'),4,pg_temp.config());
select pg_temp.ok((select status='blocked' from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='disabled')),'enabling does not release historical backlog');
select pg_temp.actor(3);insert into fx values('historical',to_jsonb(pg_temp.intake()));select pg_temp.qualify((select (v#>>'{}')::uuid from fx where k='historical'));
select pg_temp.actor(1);select crm_reconcile_external_deliveries();
select pg_temp.ok((select status='suppressed' and last_error_code='historical_event' from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='historical')),'old milestone never automatically released by enabling');
-- Website first touch + later Meta identity: provider matching never rewrites revenue attribution.
update crm_integration_connections set lifecycle_settings=jsonb_set(lifecycle_settings,'{not_before}',to_jsonb(now()-interval '1 second')) where provider='meta';
select pg_temp.actor(3);insert into fx values('cross',to_jsonb(pg_temp.intake('website')));
do $$ declare l public.crm_leads;s uuid;begin
 select * into l from crm_leads where id=(select (v#>>'{}')::uuid from fx where k='cross');
 insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
 select 'meta_instant_form',now(),now(),'server',core_fields,'[]','Meta','needs_review',repeat('c',64),(select (v->>'id')::uuid from fx where k='mm') from crm_submissions where id=l.first_submission_id returning id into s;
 insert into crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,consent_evidence,attribution_status)
 values(s,'meta','100099','page:100001:'||s,'100001','{"adult_contact":true,"meta_lifecycle_sharing":true}','partial');
 perform crm_security.accept_external_submission(s,null,l.id);
 perform pg_temp.qualify(l.id);
end $$;
insert into fx values('cross_enrollment',to_jsonb(pg_temp.enroll((select (v#>>'{}')::uuid from fx where k='cross'))));
select pg_temp.actor(1);
alter table receipts disable trigger on_receipt_created;
select create_charge_payment(jsonb_build_object('student_id',student_id,'enrollment_id',id,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1000,'payment_amount',500,'payment_method','Espèces','idempotency_key',gen_random_uuid())) from enrollments where id=(select (v#>>'{}')::uuid from fx where k='cross_enrollment');
set constraints all immediate;set constraints all deferred;
alter table receipts enable trigger on_receipt_created;
select crm_reconcile_external_deliveries();
select pg_temp.ok((select bool_and(d.attribution_submission_id=l.first_submission_id and d.matching_submission_id<>l.first_submission_id and s.channel='website' and m.channel='meta_instant_form') from crm_external_deliveries d join crm_leads l on l.id=d.lead_id join crm_submissions s on s.id=d.attribution_submission_id join crm_submissions m on m.id=d.matching_submission_id where l.id=(select (v#>>'{}')::uuid from fx where k='cross')),'explicit same-destination later Meta matching keeps website first touch');
select pg_temp.ok((select sum(r.amount_delta)=500 and bool_and(r.attribution_submission_id=l.first_submission_id) from crm_revenue_entries r join crm_leads l on l.id=r.lead_id where l.id=(select (v#>>'{}')::uuid from fx where k='cross')),'revenue remains website-attributed');
select pg_temp.ok(not exists(select 1 from crm_external_deliveries where event_kind not in ('qualified','converted')),'payment produces no value/Purchase intention');
-- Backlog is not emitted merely by enabling later: explicit unprepared retry is required.
select crm_retry_external_delivery(id) from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='disabled');
select pg_temp.ok((select status='pending' and mapping_version=4 from crm_external_deliveries where lead_id=(select (v#>>'{}')::uuid from fx where k='disabled')),'explicit retry adopts repaired configuration only before preparation');

-- A hold introduced after claim still prevents an HTTP attempt.
select pg_temp.actor(0);select crm_claim_external_deliveries(5);
do $$ declare d public.crm_external_deliveries;begin
 select * into d from crm_external_deliveries where event_kind='converted' and status='sending' order by id limit 1;
 perform pg_temp.ok(d.id is not null,'eligible conversion claimed');
 perform crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d));
 update crm_leads set conversion_review_required=true where id=d.lead_id;
 perform pg_temp.denied(format('select crm_begin_external_attempt(%L,%L)',d.id,d.lease_token));
 perform pg_temp.ok(not exists(select 1 from crm_external_delivery_attempts where delivery_id=d.id),'review holds before HTTP start');
end $$;
select pg_temp.actor(1);
-- Narrow diagnostics and stored-role enforcement.
select pg_temp.ok(crm_list_external_deliveries()::text not like '%parent@example%' and crm_list_external_deliveries()::text not like '%100009%' and crm_list_external_deliveries()::text not like '%TOKEN%' and crm_list_external_deliveries()::text not like '%CHILD-PRIVATE%','diagnostics no matching payload, token reference or child data');
do $$ declare i integer;begin for i in 2..7 loop
 perform pg_temp.actor(i);perform pg_temp.denied('select crm_list_external_deliveries()');perform pg_temp.denied('select crm_reconcile_external_deliveries()');
 perform pg_temp.denied('select crm_claim_external_deliveries()');
 perform pg_temp.denied('select crm_configure_lifecycle((select (v->>''id'')::uuid from fx where k=''meta''),5,pg_temp.config())');
 end loop;end $$;
select pg_temp.ok(not has_table_privilege('authenticated','crm_external_deliveries','select') and not has_table_privilege('service_role','crm_external_deliveries','update') and not has_table_privilege('anon','crm_external_delivery_attempts','insert'),'no direct table access');
select pg_temp.ok(not has_function_privilege('authenticated','crm_get_external_delivery(uuid,uuid)','execute'),'matching input worker-only');
select pg_temp.ok((select count(*)=2 from pg_class where relname in ('crm_external_deliveries','crm_external_delivery_attempts') and relrowsecurity),'both tables RLS');
set constraints all immediate;
rollback;
\echo PASS Phase 10 SQL

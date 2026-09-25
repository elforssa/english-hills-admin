-- Local synthetic fixtures only; every change rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(q text,code text default '42501') returns void language plpgsql as $$ begin
 begin execute q;exception when others then if sqlstate=code then return;end if;raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;end;raise exception 'Unexpected success: %',q;end $$;
select pg_temp.ok(not exists(select 1 from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token','receipt_webhook_url','receipt_webhook_token')),'no external calls configured');
select pg_temp.ok(not exists(select 1 from crm_followup_policies),'clean local CRM fixture baseline');
insert into auth.users(id,email,aud,role) select ('89000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'phase9-'||i||'@example.invalid','authenticated','authenticated' from generate_series(1,7)i;
update profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like '89000000-%';
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',case when i=0 then '' else '89000000-0000-0000-0000-'||lpad(i::text,12,'0') end,true);
 perform set_config('request.jwt.claim.role',case when i=0 then 'service_role' else 'authenticated' end,true);
end $$;
select pg_temp.actor(1);
create temp table fx(k text primary key,v jsonb);
insert into fx values('site',crm_save_website_connection('{"connection_key":"phase9-site","origin":"https://school.example"}'));
select pg_temp.ok((select not(v->>'enabled')::boolean and v->>'provider'='website' and v->>'api_version' is null and v->>'page_id' is null from fx where k='site'),'website metadata no fake Meta identity, disabled by default');
select crm_save_website_connection('{"connection_key":"phase9-site","origin":"https://school.example","enabled":true}',(select (v->>'id')::uuid from fx where k='site'),1);
insert into fx values('mapping',crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"annual","field_map":{"learner_name":"child","learner_age":"age"},"question_labels":{"child":"Apprenant"},"default_session_type":"Yearly","default_program_interest_text":"Annual","effective_from":"2020-01-01Z"}'));
insert into fx values('meta',crm_save_meta_connection('{"connection_key":"phase9-meta","page_id":"890001","api_version":"v99.0"}'));
select crm_save_meta_connection('{"connection_key":"phase9-meta","page_id":"890001","api_version":"v99.0","enabled":true}',(select (v->>'id')::uuid from fx where k='meta'),1);
insert into fx values('meta_mapping',crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='meta'),'{"form_key":"890002","field_map":{},"effective_from":"2020-01-01Z"}'));
select pg_temp.denied($q$select crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"123","field_map":{}}')$q$,'23514');
create function pg_temp.payload(learner text default 'Adam',program text default 'Annual',form text default 'annual') returns jsonb language sql as $$
 select jsonb_build_object('form_key',form,'contact',jsonb_build_object('name','Sara','phone','0612345678'),
 'answers',jsonb_build_object('child',learner,'program',program,'age',12,'days',jsonb_build_array('Lundi','Mardi')),
 'attribution',jsonb_build_object('landing_page','https://school.example/programme','referrer','https://search.example','utm_source','facebook','utm_campaign','observed-campaign','fbclid','observed-click','fbc','observed-fbc','fbp','observed-fbp'),'consent',true)
$$;
create function pg_temp.process_site(request uuid,form text default 'annual') returns jsonb language plpgsql as $$ declare j crm_ingestion_jobs;m jsonb;d jsonb;begin
 perform crm_claim_ingestion_jobs(10,'website');select * into j from crm_ingestion_jobs where external_key=form||':'||request;
 m:=crm_get_website_job_mapping(j.id,j.lease_token);
 if m is null then perform crm_fail_meta_job(j.id,j.lease_token,'missing_mapping');return '{"status":"blocked"}';end if;
 d:=jsonb_build_object('core_fields',jsonb_build_object('contact_name',j.payload->'contact'->>'name','phone',j.payload->'contact'->>'phone','learner_name',j.payload->'answers'->>'child',
  'program_interest_text',j.payload->'answers'->>'program','session_type','Yearly'),
 'form_answers','[{"key":"days","label":"Jours","value":["Lundi","Mardi"],"value_type":"array","label_source":"mapping"}]'::jsonb,'source_label','Site web • Annual');
 return crm_finalize_website_job(j.id,j.lease_token,(m->>'id')::uuid,d);
end $$;
create function pg_temp.website(learner text default 'Adam',program text default 'Annual',request uuid default gen_random_uuid()) returns jsonb language plpgsql as $$ begin
 perform crm_accept_website_inquiry('phase9-site','annual',request,pg_temp.payload(learner,program));return pg_temp.process_site(request);
end $$;
create function pg_temp.meta(external_id text,learner text default 'Adam',program text default 'Annual',happened timestamptz default now()) returns jsonb language plpgsql as $$ declare j crm_ingestion_jobs;begin
 perform crm_accept_meta_events(jsonb_build_array(jsonb_build_object('page_id','890001','leadgen_id',external_id,'form_id','890002','created_time',1700000000)));
 perform crm_claim_meta_jobs();select * into j from crm_ingestion_jobs where external_key='890001:'||external_id;
 return crm_finalize_meta_job(j.id,j.lease_token,(select (v->>'id')::uuid from fx where k='meta_mapping'),jsonb_build_object('occurred_at',happened,
 'core_fields',jsonb_build_object('contact_name','Sara','phone','0612345678','learner_name',learner,'program_interest_text',program,'session_type','Yearly'),
 'form_answers','[]'::jsonb,'source_label','Meta','attribution',jsonb_build_object('external_submission_id',external_id,'page_id','890001','form_id','890002','campaign_id','123456789','attribution_status','partial')));
end $$;
select pg_temp.actor(0);
select pg_temp.ok(crm_get_website_site('phase9-site','https://school.example'),'configured origin');
select pg_temp.ok(not crm_get_website_site('phase9-site','https://evil.example'),'wrong origin');
-- Durable unknown mapping and no-policy paths.
select crm_accept_website_inquiry('phase9-site','unknown','89000000-0000-0000-0000-000000000100',pg_temp.payload('Unknown child','Annual','unknown'));
select pg_temp.process_site('89000000-0000-0000-0000-000000000100','unknown');
select pg_temp.ok((select status='blocked' and last_error_code='missing_mapping' and payload->'answers'->>'child'='Unknown child' from crm_ingestion_jobs where external_key='unknown:89000000-0000-0000-0000-000000000100'),'unknown form retains durable evidence');
select pg_temp.website('Adam','Annual','89000000-0000-0000-0000-000000000101');
select pg_temp.ok((select status='blocked' and last_error_code='missing_policy' and submission_id is not null from crm_ingestion_jobs where external_key='annual:89000000-0000-0000-0000-000000000101'),'missing policy keeps submission');
select pg_temp.actor(1);
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
select crm_retry_meta_job(id) from crm_ingestion_jobs where last_error_code='missing_policy';
select crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"unknown","field_map":{"learner_name":"other_child"},"effective_from":"2020-01-01Z"}');
select crm_retry_meta_job(id) from crm_ingestion_jobs where last_error_code='missing_mapping';
select pg_temp.actor(0);
select pg_temp.process_site('89000000-0000-0000-0000-000000000101');
-- Claim helper took the other pending job too; finalize it using its same lease.
select crm_finalize_website_job(id,lease_token,(crm_get_website_job_mapping(id,lease_token)->>'id')::uuid,'{"core_fields":{"contact_name":"Sara","phone":"0612345678","learner_name":"Unknown child","program_interest_text":"Annual","session_type":"Yearly"},"form_answers":[],"source_label":"Site web"}') from crm_ingestion_jobs where event_kind='website_inquiry' and status='processing';
select pg_temp.ok((select count(*)=2 from crm_leads),'blocked jobs recover without loss');
select pg_temp.meta('890010','Adam','Annual',now()+interval '1 minute');
select pg_temp.ok((select (select channel from crm_submissions where id=l.first_submission_id)='website' and (select channel from crm_submissions where id=l.latest_submission_id)='meta_instant_form' from crm_leads l where learner_name='Adam'),'website first then Meta preserves first touch');
select pg_temp.meta('890011','Lina');select pg_temp.website('Lina');
select pg_temp.ok((select (select channel from crm_submissions where id=l.first_submission_id)='meta_instant_form' and (select channel from crm_submissions where id=l.latest_submission_id)='website' from crm_leads l where learner_name='Lina'),'Meta first then website latest');
select pg_temp.meta('890012','Lina','Annual',now()-interval '1 day');
select pg_temp.ok((select (select channel from crm_submissions where id=l.latest_submission_id)='website' from crm_leads l where learner_name='Lina'),'delayed Meta never replaces newer website');
select pg_temp.website('Adam','Summer');
select pg_temp.ok((select count(*)=4 from crm_leads),'siblings/programs separated across channels');
select pg_temp.ok((select count(*)=4 from crm_tasks where task_type='first_contact'),'one first-contact task per new opportunity');
select pg_temp.ok((select bool_and(due_at=crm_security.next_window(policy_id,due_at)) from crm_tasks),'shared calling windows');
-- Same key/payload replays identically; changes conflict.
do $$ begin for i in 1..10 loop perform crm_accept_website_inquiry('phase9-site','annual','89000000-0000-0000-0000-000000000101',pg_temp.payload());end loop;end $$;
select pg_temp.ok(crm_website_inquiry_status('phase9-site','annual','89000000-0000-0000-0000-000000000101',pg_temp.payload())='received','stable request identity');
select pg_temp.denied($q$select crm_accept_website_inquiry('phase9-site','annual','89000000-0000-0000-0000-000000000101',pg_temp.payload('Changed'))$q$,'23505');
select pg_temp.ok((select count(*)=1 from crm_ingestion_jobs where external_key='annual:89000000-0000-0000-0000-000000000101'),'retry no duplicate job');
select pg_temp.ok((select bool_and(campaign_id is null and ad_id is null and adset_id is null and page_id is null and provider_created_at is null and raw_payload is null) from crm_submission_attribution where provider='website'),'observed website fields never trusted Meta IDs or browser dumps');
select pg_temp.ok((select bool_and(utm_campaign='observed-campaign' and fbclid='observed-click' and retention_until is null) from crm_submission_attribution where provider='website'),'observed attribution preserved, no invented retention');
-- Ambiguity uses the same operational review.
select pg_temp.website(null);
select pg_temp.actor(3);
select pg_temp.ok((crm_list_intake_review()->>'total')::integer=1,'website intake uses shared review');
select pg_temp.ok(crm_list_intake_review()::text not like '%observed-click%','tracking hidden in review');
select crm_resolve_external_intake(gen_random_uuid(),id,'reject') from crm_submissions where match_status='needs_review';
select pg_temp.actor(0);
update crm_leads set status='LOST',closed_at=now(),closure_reason='postponed' where learner_name='Lina';
select pg_temp.website('Lina');select pg_temp.ok((select count(*)=2 from crm_leads where learner_name='Lina'),'closed cross-channel opportunity not reopened');
-- Website first touch flows through unchanged Phase 6 conversion and Phase 7 revenue.
alter table public.receipts disable trigger on_receipt_created;
do $$ declare l public.crm_leads;r jsonb;first_touch uuid;student uuid;enrollment uuid;before_center jsonb;begin
 select * into l from crm_leads where learner_name='Adam' and program_interest_text='Annual';first_touch:=l.first_submission_id;
 perform pg_temp.actor(3);
 perform crm_qualify_lead(gen_random_uuid(),jsonb_build_object('lead_id',l.id,'expected_version',l.version,'conversation_channel','phone','note','Synthetic inquiry','qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));
 select * into l from crm_leads where id=l.id;
 r:=crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',l.id,'expected_version',l.version,'student_choice','new','learner_name','Phase9 learner','birth_date','2014-05-10','session_type','Yearly','school_year','2026/2027','level','Child 2','candidate_review',crm_security.candidate_token(l.id,'Phase9 learner','2014-05-10'),'confirm_new',true));
 student:=(r->'enrollment'->>'student_id')::uuid;enrollment:=(r->'enrollment'->>'id')::uuid;
 perform pg_temp.actor(1);
 perform create_charge_payment(jsonb_build_object('student_id',student,'enrollment_id',enrollment,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1000,'payment_amount',500,'payment_method','Espèces','idempotency_key',gen_random_uuid()));
 set constraints all immediate;set constraints all deferred;
 perform pg_temp.ok((select channel='website' from crm_submissions where id=first_touch),'first-touch fixture is website');
 perform pg_temp.ok((select sum(amount_delta)=500 and bool_and(attribution_submission_id=first_touch) from crm_revenue_entries where lead_id=l.id),'unchanged revenue pipeline freezes website first touch despite later Meta touch');
 select jsonb_build_array((select count(*) from students),(select count(*) from enrollments),(select count(*) from placement_tests),(select count(*) from charges),(select count(*) from receipts),(select count(*) from financial_events)) into before_center;
 perform pg_temp.actor(0);perform pg_temp.website('Adam','Annual');
 perform pg_temp.ok((select status='CONVERTED' and first_submission_id=first_touch from crm_leads where id=l.id),'later inquiry does not alter converted opportunity');
 perform pg_temp.ok((select count(*)=2 from crm_leads where learner_name='Adam' and program_interest_text='Annual'),'converted inquiry creates distinct opportunity');
 perform pg_temp.ok(before_center=jsonb_build_array((select count(*) from students),(select count(*) from enrollments),(select count(*) from placement_tests),(select count(*) from charges),(select count(*) from receipts),(select count(*) from financial_events)),'website inquiry creates no center or financial records');
end $$;
alter table public.receipts enable trigger on_receipt_created;
-- Immutable website mapping versions use the durable receipt time, not worker time.
select pg_temp.actor(1);
insert into fx values('version1',crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"versioned","field_map":{"learner_name":"child"},"default_program_interest_text":"Annual","effective_from":"2020-01-01Z"}'));
insert into fx values('version2',crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"versioned","field_map":{"learner_name":"new_child"},"default_program_interest_text":"Summer","effective_from":"2099-01-01Z"}'));
select pg_temp.ok((select (v->>'version')::int=2 from fx where k='version2'),'mapping version increments');
select pg_temp.actor(0);
select crm_accept_website_inquiry('phase9-site','versioned','89000000-0000-0000-0000-000000000200',jsonb_set(pg_temp.payload('Version child','Annual','versioned'),'{attribution}','{}'));
select crm_claim_ingestion_jobs(10,'website');
select pg_temp.ok((crm_get_website_job_mapping(id,lease_token)->>'id')::uuid=(select (v->>'id')::uuid from fx where k='version1'),'future version does not reinterpret queued inquiry') from crm_ingestion_jobs where external_key='versioned:89000000-0000-0000-0000-000000000200';
select crm_finalize_website_job(id,lease_token,(crm_get_website_job_mapping(id,lease_token)->>'id')::uuid,'{"core_fields":{"contact_name":"Sara","phone":"0612345678","learner_name":"Version child","program_interest_text":"Annual"},"form_answers":[],"source_label":"Site web"}') from crm_ingestion_jobs where external_key='versioned:89000000-0000-0000-0000-000000000200';
select pg_temp.ok((select a.attribution_status='unavailable' and a.landing_page is null and a.referrer is null and a.utm_source is null and a.utm_campaign is null and a.fbclid is null and a.fbc is null and a.fbp is null from crm_submission_attribution a join crm_ingestion_jobs j on j.submission_id=a.submission_id where j.external_key='versioned:89000000-0000-0000-0000-000000000200'),'missing observations remain NULL');
select pg_temp.actor(1);
select crm_retire_meta_form_mapping((select (v->>'id')::uuid from fx where k='version1'));
select pg_temp.actor(0);
select pg_temp.ok((select form_mapping_id=(select (v->>'id')::uuid from fx where k='version1') from crm_submissions where id=(select submission_id from crm_ingestion_jobs where external_key='versioned:89000000-0000-0000-0000-000000000200')),'accepted snapshot remains on original mapping after retirement');

-- Role/execute boundaries and fixed server limiter.
do $$ declare i integer;begin
 for i in 1..7 loop
  perform pg_temp.actor(i);
  if i<>1 then perform pg_temp.denied('select crm_save_website_connection(''{"connection_key":"forbidden","origin":"https://evil.example"}'')');end if;
  perform pg_temp.denied('select crm_claim_ingestion_jobs()');
  if i<>1 then perform pg_temp.denied('select crm_get_submission_attribution((select id from crm_submissions limit 1))');end if;
 end loop;
end $$;
select pg_temp.ok(not has_function_privilege('anon','crm_accept_website_inquiry(text,text,uuid,jsonb)','execute'),'no anonymous DB ingestion');
select pg_temp.ok(not has_function_privilege('authenticated','crm_finalize_website_job(uuid,uuid,uuid,jsonb)','execute'),'no browser finalization');
select pg_temp.actor(0);
do $$ begin for i in 1..10 loop perform pg_temp.ok(crm_check_website_rate_limit(repeat('9',64)),'allowed initial rate');end loop;perform pg_temp.ok(not crm_check_website_rate_limit(repeat('9',64)),'fixed rate exceeded');end $$;
set constraints all immediate;
rollback;
\echo PASS Phase 9 SQL

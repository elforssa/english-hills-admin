-- CRM Meta funnel revision-4 live-mode acceptance matrix. Synthetic local
-- fixtures only; no HTTP/provider call is possible and every write rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(q text,code text default '42501') returns void language plpgsql as $$ begin begin execute q;exception when others then if sqlstate=code then return;end if;raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;end;raise exception 'Unexpected success: %',q;end $$;
insert into auth.users(id,email,aud,role) values
 ('8c000000-0000-0000-0000-000000000001','r4-director@example.invalid','authenticated','authenticated'),
 ('8c000000-0000-0000-0000-000000000002','r4-reception@example.invalid','authenticated','authenticated');
update public.profiles set role=case right(id::text,1) when '1' then 'director' else 'receptionist' end where id::text like '8c000000-%';
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',case when i=0 then '' else '8c000000-0000-0000-0000-'||lpad(i::text,12,'0') end,true);
 perform set_config('request.jwt.claim.role',case when i=0 then 'service_role' else 'authenticated' end,true);end $$;
select pg_temp.actor(1);
select public.crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
create temp table fx(k text primary key,id uuid);
insert into fx values('connection',(public.crm_save_meta_connection('{"connection_key":"r4-live","page_id":"882001","api_version":"v99.0"}')->>'id')::uuid);
insert into fx values('mapping',(public.crm_publish_meta_form_mapping((select id from fx where k='connection'),'{"form_key":"882002","form_name":"R4 compliant fixture","field_map":{},"effective_from":"2020-01-01Z"}')->>'id')::uuid);
insert into public.crm_lifecycle_provider_contracts(id,contract_key,revision,api_version,qualified_event_name,converted_event_name,action_source,
 maximum_event_age_seconds,deduplication_window_seconds,accepted_response_field,lead_id_only,required_constants,evidence_urls,verified_on,approved_at,lifecycle_model,event_map,uncertainty_policy)
values('8c000000-0000-0000-0000-000000000010','r4_fixture',4,'v99.0','Qualified','Converted','system_generated',604800,null,'events_received',true,
 '{"event_source":"crm","lead_event_source":"English Hills CRM"}','["https://developers.facebook.com/docs/fixture"]',current_date,clock_timestamp(),'r4_stage_entry',
 '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}','no_uncertain_replay');
select pg_temp.denied($q$insert into public.crm_lifecycle_provider_contracts(contract_key,revision,api_version,qualified_event_name,converted_event_name,action_source,
 maximum_event_age_seconds,deduplication_window_seconds,accepted_response_field,lead_id_only,required_constants,evidence_urls,verified_on,approved_at,lifecycle_model,event_map,uncertainty_policy)
 values('r4_bad_source',1,'v99.0','Qualified','Converted','phone_call',604800,null,'events_received',true,
 '{"event_source":"crm","lead_event_source":"English Hills CRM"}','["https://developers.facebook.com/docs/fixture"]',current_date,clock_timestamp(),'r4_stage_entry',
 '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}','no_uncertain_replay')$q$,'23514');
select pg_temp.denied($q$insert into public.crm_lifecycle_provider_contracts(contract_key,revision,api_version,qualified_event_name,converted_event_name,action_source,
 maximum_event_age_seconds,deduplication_window_seconds,accepted_response_field,lead_id_only,required_constants,evidence_urls,verified_on,approved_at,lifecycle_model,event_map,uncertainty_policy)
 values('r4_bad_age',1,'v99.0','Qualified','Converted','system_generated',604801,null,'events_received',true,
 '{"event_source":"crm","lead_event_source":"English Hills CRM"}','["https://developers.facebook.com/docs/fixture"]',current_date,clock_timestamp(),'r4_stage_entry',
 '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}','no_uncertain_replay')$q$,'23514');
select pg_temp.denied($q$insert into public.crm_lifecycle_provider_contracts(contract_key,revision,api_version,qualified_event_name,converted_event_name,action_source,
 maximum_event_age_seconds,deduplication_window_seconds,accepted_response_field,lead_id_only,required_constants,evidence_urls,verified_on,approved_at,lifecycle_model,event_map,uncertainty_policy)
 values('r4_empty_constants',1,'v99.0','Qualified','Converted','system_generated',604800,null,'events_received',true,
 '{}','["https://developers.facebook.com/docs/fixture"]',current_date,clock_timestamp(),'r4_stage_entry',
 '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}','no_uncertain_replay')$q$,'23514');
select public.crm_configure_lifecycle((select id from fx where k='connection'),1,jsonb_build_object('mode','live','enabled',false,'dataset_id','882003',
 'secret_ref','CRM_META_LIFECYCLE_TOKEN_R4_FIXTURE','contract_id','8c000000-0000-0000-0000-000000000010','max_attempts',3));
insert into public.crm_lifecycle_eligibility_policies(id,connection_id,form_mapping_id,version,notice_version,notice_text_digest,adult_field_key,adult_accepted_values,
 sharing_field_key,sharing_accepted_values,notice_field_key,notice_accepted_values,effective_from,effective_until,created_by,lifecycle_model,allowed_event_kinds)
values('8c000000-0000-0000-0000-000000000011',(select id from fx where k='connection'),(select id from fx where k='mapping'),1,'notice-r4',repeat('a',64),
 'adult_confirmed','["yes"]','meta_share','["yes"]','notice_version','["notice-r4"]',clock_timestamp()-interval '1 day',clock_timestamp()+interval '7 days',
 '8c000000-0000-0000-0000-000000000001','r4_stage_entry','["intake","not_qualified","lost","qualified","converted"]');
insert into public.crm_lifecycle_producer_boundaries(id,connection_id,form_mapping_id,form_key,page_id,dataset_id,provider_contract_id,eligibility_policy_id,
 policy_version,notice_version,notice_text_digest,lifecycle_model,permitted_producer,valid_from,valid_until,
 legacy_exclusion_verified,legacy_exclusion_reference,legacy_exclusion_verified_at,legacy_exclusion_valid_until,verified_by)
values('8c000000-0000-0000-0000-000000000012',(select id from fx where k='connection'),(select id from fx where k='mapping'),'882002','882001','882003',
 '8c000000-0000-0000-0000-000000000010','8c000000-0000-0000-0000-000000000011',1,'notice-r4',repeat('a',64),'r4_stage_entry','eh_native',
 clock_timestamp()-interval '1 minute',(select effective_until from public.crm_lifecycle_eligibility_policies where id='8c000000-0000-0000-0000-000000000011'),true,
 'synthetic-legacy-exclusion-proof',clock_timestamp()-interval '2 minutes',(select effective_until from public.crm_lifecycle_eligibility_policies where id='8c000000-0000-0000-0000-000000000011'),'local-test-operator');
select pg_temp.ok((select page_id='882001' and dataset_id='882003' and provider_contract_id='8c000000-0000-0000-0000-000000000010'
 and eligibility_policy_id='8c000000-0000-0000-0000-000000000011' and policy_version=1 and notice_version='notice-r4' and notice_text_digest=repeat('a',64)
 from public.crm_lifecycle_producer_boundaries where id='8c000000-0000-0000-0000-000000000012'),'producer boundary freezes exact Page/dataset/contract/policy/notice manifest');
select pg_temp.actor(0);
with created as (
 insert into public.crm_lifecycle_activation_epochs(connection_id,provider_contract_id,started_at,activated_by)
 values((select id from fx where k='connection'),'8c000000-0000-0000-0000-000000000010',now()-interval '2 minutes','release_operator') returning id
) insert into fx select 'epoch',id from created;
update public.crm_integration_connections set lifecycle_settings=lifecycle_settings||jsonb_build_object(
 'enabled',true,'live_started_at',now()-interval '2 minutes','activation_epoch_id',(select id from fx where k='epoch')),version=version+1
where id=(select id from fx where k='connection');

create function pg_temp.intake(external_id text,with_evidence boolean default true,occurred timestamptz default now()-interval '1 second') returns uuid language plpgsql as $$
declare submission uuid;lead uuid;begin
 insert into public.crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
 values('meta_instant_form',clock_timestamp(),occurred,'provider','{"contact_name":"Adult fixture","phone":"0612345678","email":"adult@example.invalid","learner_name":"PRIVATE CHILD","learner_age":12,"program_interest_text":"Annual","session_type":"Yearly"}',
 '[{"key":"adult_confirmed","label":"Adult","value":"yes","value_type":"string","label_source":"provider"},{"key":"meta_share","label":"Share","value":"yes","value_type":"string","label_source":"provider"},{"key":"notice_version","label":"Notice","value":"notice-r4","value_type":"string","label_source":"provider"}]',
 'R4 fixture','needs_review',encode(sha256(convert_to(external_id||occurred::text,'UTF8')),'hex'),(select id from fx where k='mapping')) returning id into submission;
 insert into public.crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,form_id,consent_evidence,attribution_status,provider_created_at)
 values(submission,'meta',external_id,'page:882001:'||submission,'882001','882002','{}','partial',occurred);
 lead:=crm_security.accept_external_submission(submission);
 if with_evidence then perform public.crm_record_lifecycle_evidence_check(submission,'8c000000-0000-0000-0000-000000000011',true,'eligible',repeat('b',64));end if;return lead;end $$;
create function pg_temp.act(cmd text,l uuid,data jsonb) returns jsonb language plpgsql as $$ declare result jsonb;begin
 execute format('select public.crm_%I($1,$2)',cmd) into result using gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l))||data;return result;end $$;
create function pg_temp.qualify(l uuid) returns void language plpgsql as $$ begin perform pg_temp.act('qualify_lead',l,jsonb_build_object('conversation_channel','phone','note','PRIVATE NOTE',
 'qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));end $$;
create function pg_temp.enroll(l uuid) returns uuid language plpgsql as $$ declare result jsonb;begin
 result:=public.crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),'student_choice','new',
 'learner_name','Private learner','birth_date','2014-05-10','session_type','Yearly','school_year','2026/2027','level','Child 2',
 'candidate_review',crm_security.candidate_token(l,'Private learner','2014-05-10'),'confirm_new',true));return (result->'enrollment'->>'id')::uuid;end $$;
create function pg_temp.payload(d public.crm_external_deliveries) returns jsonb language sql as $$ select jsonb_build_object('data',jsonb_build_array(jsonb_build_object(
 'event_name',d.mapping_snapshot->'events'->>d.event_kind,'event_id',d.provider_event_id,'event_time',floor(extract(epoch from d.event_time))::bigint,
 'action_source','system_generated','user_data',jsonb_build_object('lead_id',(select source_external_id from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id)),
 'custom_data',jsonb_build_object('event_source','crm','lead_event_source','English Hills CRM')))) $$;

insert into fx values('history',pg_temp.intake('882010'));
with base as (select occurred_at,created_at from public.crm_activities where lead_id=(select id from fx where k='history') and event_type='lead_created')
insert into public.crm_activities(lead_id,occurred_at,created_at,actor_kind,event_type,source_key,from_status,to_status)
select (select id from fx where k='history'),base.occurred_at,base.created_at+v.ordinal*interval '1 microsecond','system',v.event_type,'r4-history-'||v.ordinal,v.from_status,v.to_status
from base cross join (values
 (1,'lead_not_qualified','NEW','NOT_QUALIFIED'),(2,'lead_reopened','NOT_QUALIFIED','CONTACTING'),
 (3,'lead_qualified','ENGAGED','QUALIFIED'),(4,'lead_lost','QUALIFIED','LOST'),(5,'lead_reopened','LOST','ENGAGED'),
 (6,'lead_qualified','ENGAGED','QUALIFIED'),(7,'lead_not_qualified','QUALIFIED','NOT_QUALIFIED')
) v(ordinal,event_type,from_status,to_status);
select pg_temp.actor(0);insert into fx values('direct',pg_temp.intake('882011'));
update public.crm_leads set status='QUALIFIED',version=version+1 where id=(select id from fx where k='direct');
select pg_temp.actor(1);insert into fx values('direct_enrollment',pg_temp.enroll((select id from fx where k='direct')));
update public.enrollments set status='Confirmed',updated_at=clock_timestamp()+interval '1 millisecond' where id=(select id from fx where k='direct_enrollment');set constraints all immediate;set constraints all deferred;
select pg_temp.actor(0);select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok((select count(*)=1 from public.crm_external_deliveries where lead_id=(select id from fx where k='history') and event_kind='intake'),'Intake is singleton');
select pg_temp.ok((select count(*)=2 from public.crm_external_deliveries where lead_id=(select id from fx where k='history') and event_kind='qualified'),'real reopen creates two qualification occurrences');
select pg_temp.ok((select count(*)=2 from public.crm_external_deliveries where lead_id=(select id from fx where k='history') and event_kind='not_qualified'),'real reopen creates two not-qualified closures');
select pg_temp.ok((select count(*)=1 from public.crm_external_deliveries where lead_id=(select id from fx where k='history') and event_kind='lost'),'Lost derives only from committed closure');
select pg_temp.ok((select count(*)=2 and count(*) filter(where event_kind='qualified')=0 from public.crm_external_deliveries where lead_id=(select id from fx where k='direct')),'direct conversion has Intake and Converted only');
select pg_temp.ok((select bool_and(case when event_kind='intake' then crm_security.lifecycle_predecessor_hold(d) is null else crm_security.lifecycle_predecessor_hold(d)='unattempted_predecessor' end)
 from public.crm_external_deliveries d where lead_id=(select id from fx where k='history')),'shared helper sees earlier unattempted occurrences');

create temp table claim1 as select x.* from jsonb_to_recordset(public.crm_claim_external_deliveries(1,true)) x(id uuid,lease_token uuid);
select pg_temp.ok((select d.event_kind='intake' from claim1 c join public.crm_external_deliveries d on d.id=c.id),'chronological claim starts with Intake');
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join claim1 c on c.id=d.id;
select public.crm_begin_external_attempt(d.id,d.lease_token) from public.crm_external_deliveries d join claim1 c on c.id=d.id;
select public.crm_finish_external_attempt(d.id,d.lease_token,'{"outcome":"blocked","error_code":"provider_auth","http_status":200}') from public.crm_external_deliveries d join claim1 c on c.id=d.id;
select pg_temp.ok((select d.status='unknown' and d.next_attempt_at is null and d.attempt_boundary_state='unknown' and d.last_error_code='malformed_response'
 from public.crm_external_deliveries d join claim1 c on c.id=d.id),'contradictory 2xx result is durably normalized to unknown and unreplayable');
select pg_temp.actor(1);select pg_temp.denied(format('select public.crm_retry_external_delivery(%L)',(select id from claim1)),'22023');
select pg_temp.actor(0);create temp table claim2 as select x.* from jsonb_to_recordset(public.crm_claim_external_deliveries(1,true)) x(id uuid,lease_token uuid);
select pg_temp.ok((select count(*)=1 and bool_and(id<>(select id from claim1)) from claim2),'unknown receipt does not suppress next genuine occurrence');
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join claim2 c on c.id=d.id;
select public.crm_begin_external_attempt(d.id,d.lease_token) from public.crm_external_deliveries d join claim2 c on c.id=d.id;
update public.crm_external_deliveries d set lease_until=now()-interval '1 second' from claim2 c where d.id=c.id;
select public.crm_claim_external_deliveries(1,true);
select pg_temp.ok((select d.status='unknown' and d.next_attempt_at is null and d.attempt_boundary_state='unknown' and d.attempt_count=1 from public.crm_external_deliveries d join claim2 c on c.id=d.id),'expired started lease is unreplayable unknown');
select public.crm_claim_external_deliveries(3,true);select public.crm_claim_external_deliveries(3,true);
select pg_temp.ok((select bool_and(attempt_count=1) from public.crm_external_deliveries d where d.id in(select id from claim1 union all select id from claim2)),'repeated ticks do not increase uncertain identity attempts');

insert into fx values('no_evidence',pg_temp.intake('882020',false));
select pg_temp.actor(1);select pg_temp.act('close_lost',(select id from fx where k='no_evidence'),'{"reason":"postponed"}');
select pg_temp.actor(0);select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='no_evidence'))
 and not exists(select 1 from public.crm_external_deliveries where lead_id=(select id from fx where k='no_evidence')),'D2 required for Intake and negative outcomes');
select public.crm_record_lifecycle_evidence_check((select first_submission_id from public.crm_leads where id=(select id from fx where k='no_evidence')),
 '8c000000-0000-0000-0000-000000000011',true,'eligible',repeat('c',64));
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='no_evidence'))
 and (select count(*)=2 from public.crm_external_deliveries where lead_id=(select id from fx where k='no_evidence') and event_kind in ('intake','lost')),
 'eligible evidence recorded later still admits only the genuine prospective Intake and Lost facts');
insert into fx values('at_boundary',pg_temp.intake('882026',true,(select valid_from from public.crm_lifecycle_producer_boundaries where id='8c000000-0000-0000-0000-000000000012')));
insert into fx values('at_boundary_end',pg_temp.intake('882027',true,(select valid_until from public.crm_lifecycle_producer_boundaries where id='8c000000-0000-0000-0000-000000000012')));
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='at_boundary'))
 and not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='at_boundary_end')),
 'producer interval includes exact valid_from and excludes exact valid_until');
insert into fx values('pre_cutoff',pg_temp.intake('882021',true,(select started_at from public.crm_lifecycle_activation_epochs where id=(select id from fx where k='epoch'))-interval '1 second'));
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(not exists(select 1 from public.crm_external_deliveries where lead_id=(select id from fx where k='pre_cutoff')),'submission before cutoff excluded');

insert into fx values('qualified_converted',pg_temp.intake('882028',true,
 (select valid_from+interval '2 seconds' from public.crm_lifecycle_producer_boundaries where id='8c000000-0000-0000-0000-000000000012')));
select pg_temp.actor(1);select pg_temp.qualify((select id from fx where k='qualified_converted'));
insert into fx values('qualified_converted_enrollment',pg_temp.enroll((select id from fx where k='qualified_converted')));
update public.enrollments set status='Confirmed',updated_at=clock_timestamp()+interval '1 millisecond' where id=(select id from fx where k='qualified_converted_enrollment');
set constraints all immediate;set constraints all deferred;
set local session_replication_role=replica;
with ordered as (select occurred_at,created_at from public.crm_activities where lead_id=(select id from fx where k='qualified_converted') and event_type='lead_created')
update public.crm_activities a set occurred_at=ordered.occurred_at+case a.event_type when 'lead_qualified' then interval '1 millisecond' else interval '2 milliseconds' end,
 created_at=ordered.created_at+case a.event_type when 'lead_qualified' then interval '1 microsecond' else interval '2 microseconds' end
from ordered where a.lead_id=(select id from fx where k='qualified_converted') and a.event_type in ('lead_qualified','lead_converted');
set local session_replication_role=origin;
select pg_temp.actor(0);select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok((select count(*)=3 and count(*) filter(where event_kind in ('intake','qualified','converted'))=3
 from public.crm_external_deliveries where lead_id=(select id from fx where k='qualified_converted')),
 'qualified-to-converted fixture has only the three genuine stage entries');
create temp table qc_intake as select x.* from jsonb_to_recordset(crm_security.claim_lifecycle_deliveries(100,true)) x(id uuid,lease_token uuid)
 join public.crm_external_deliveries d on d.id=x.id where d.lead_id=(select id from fx where k='qualified_converted') and d.event_kind='intake';
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join qc_intake c on c.id=d.id;
select public.crm_begin_external_attempt(d.id,d.lease_token) from public.crm_external_deliveries d join qc_intake c on c.id=d.id;
select public.crm_finish_external_attempt(d.id,d.lease_token,'{"outcome":"sent","http_status":200}') from public.crm_external_deliveries d join qc_intake c on c.id=d.id;
create temp table qc_qualified as select x.* from jsonb_to_recordset(crm_security.claim_lifecycle_deliveries(100,true)) x(id uuid,lease_token uuid)
 join public.crm_external_deliveries d on d.id=x.id where d.lead_id=(select id from fx where k='qualified_converted') and d.event_kind='qualified';
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join qc_qualified c on c.id=d.id;
select public.crm_begin_external_attempt(d.id,d.lease_token) from public.crm_external_deliveries d join qc_qualified c on c.id=d.id;
select pg_temp.denied(format('select public.crm_begin_external_attempt(%L,%L)',(select id from qc_qualified),(select lease_token from qc_qualified)),'40001');
select public.crm_finish_external_attempt(d.id,d.lease_token,'{"outcome":"unknown","error_code":"network"}') from public.crm_external_deliveries d join qc_qualified c on c.id=d.id;
create temp table qc_converted as select x.* from jsonb_to_recordset(crm_security.claim_lifecycle_deliveries(100,true)) x(id uuid,lease_token uuid)
 join public.crm_external_deliveries d on d.id=x.id where d.lead_id=(select id from fx where k='qualified_converted') and d.event_kind='converted';
select pg_temp.ok((select count(*)=1 and bool_and(d.event_kind='converted') from qc_converted c join public.crm_external_deliveries d on d.id=c.id),
 'unknown Qualified remains unreplayable but does not permanently block the later genuine Converted occurrence');
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join qc_converted c on c.id=d.id;
select public.crm_begin_external_attempt(d.id,d.lease_token) from public.crm_external_deliveries d join qc_converted c on c.id=d.id;
select public.crm_finish_external_attempt(d.id,d.lease_token,'{"outcome":"sent","http_status":200}') from public.crm_external_deliveries d join qc_converted c on c.id=d.id;

update public.crm_external_deliveries set next_attempt_at=now()+interval '1 day'
where lifecycle_model='r4_stage_entry' and status in ('pending','retry');
insert into fx values('revoke_lead',pg_temp.intake('882022'));
select public.crm_reconcile_external_deliveries(100);
create temp table revoke_claim as select x.* from jsonb_to_recordset(public.crm_claim_external_deliveries(1,true)) x(id uuid,lease_token uuid);
select pg_temp.ok((select count(*)=1 and bool_and(d.lead_id=(select id from fx where k='revoke_lead') and d.event_kind='intake')
 from revoke_claim c join public.crm_external_deliveries d on d.id=c.id),'isolated Intake is claimed before evidence revocation');
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join revoke_claim c on c.id=d.id;
select pg_temp.actor(1);insert into fx values('revocation',public.crm_revoke_lifecycle_evidence(gen_random_uuid(),
 (select d.eligibility_evidence_id from revoke_claim c join public.crm_external_deliveries d on d.id=c.id),'source_corrected'));
select pg_temp.actor(0);select pg_temp.denied(format('select public.crm_begin_external_attempt(%L,%L)',
 (select id from revoke_claim),(select lease_token from revoke_claim)),'42501');
select pg_temp.ok((select d.attempt_count=0 and d.attempt_boundary_state='not_started' and not exists(
 select 1 from public.crm_external_delivery_attempts a where a.delivery_id=d.id) from revoke_claim c join public.crm_external_deliveries d on d.id=c.id),
 'evidence revoked between claim and begin prevents provider-boundary entry');
update public.crm_external_deliveries d set lease_until=now()-interval '1 second' from revoke_claim c where d.id=c.id;
select public.crm_claim_external_deliveries(1,true);
select pg_temp.ok((select d.status='suppressed' and d.last_error_code='sharing_revoked' from revoke_claim c join public.crm_external_deliveries d on d.id=c.id),
 'revoked pre-dispatch lease cannot become replayable work');

insert into fx values('paged',pg_temp.intake('882023'));
with base as (select occurred_at,created_at from public.crm_activities where lead_id=(select id from fx where k='paged') and event_type='lead_created')
insert into public.crm_activities(lead_id,occurred_at,created_at,actor_kind,event_type,source_key,from_status,to_status)
select (select id from fx where k='paged'),occurred_at+interval '1 second',created_at+interval '1 microsecond','system','lead_qualified','r4-paged-qualified','ENGAGED','QUALIFIED' from base;
select public.crm_reconcile_external_deliveries(1);
select pg_temp.ok(exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='paged'))
 and not exists(select 1 from public.crm_external_deliveries where lead_id=(select id from fx where k='paged')),
 'bounded admission page records ownership before materialization');
select public.crm_reconcile_external_deliveries(1);select public.crm_reconcile_external_deliveries(1);
select pg_temp.ok((select count(*)=2 and count(*) filter(where event_kind='intake')=1 and count(*) filter(where event_kind='qualified')=1
 from public.crm_external_deliveries where lead_id=(select id from fx where k='paged')),
 'candidate discovery materializes the earlier occurrence outside the later one-row page');
select pg_temp.ok((select crm_security.lifecycle_predecessor_hold(d)='unattempted_predecessor' from public.crm_external_deliveries d
 where d.lead_id=(select id from fx where k='paged') and d.event_kind='qualified'),
 'shared ordering helper holds the later paged occurrence at claim and begin');

insert into fx values('contradictory',pg_temp.intake('882024'));
with base as (select occurred_at,created_at from public.crm_activities where lead_id=(select id from fx where k='contradictory') and event_type='lead_created')
insert into public.crm_activities(lead_id,occurred_at,created_at,actor_kind,event_type,source_key,from_status,to_status)
select (select id from fx where k='contradictory'),occurred_at-interval '1 second',created_at+interval '1 microsecond','system','lead_qualified','r4-contradictory-qualified','ENGAGED','QUALIFIED' from base;
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok((select status='suppressed' and last_error_code='contradictory_chronology' from public.crm_external_deliveries
 where lead_id=(select id from fx where k='contradictory') and event_kind='qualified'),'contradictory chronology fails closed');

insert into fx values('legacy_owned',pg_temp.intake('882025'));
insert into public.crm_lifecycle_producer_ownership(lead_id,connection_id,boundary_id,activation_epoch_id,producer)
values((select id from fx where k='legacy_owned'),(select id from fx where k='connection'),'8c000000-0000-0000-0000-000000000012',(select id from fx where k='epoch'),'legacy');
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(not exists(select 1 from public.crm_external_deliveries where lead_id=(select id from fx where k='legacy_owned')),
 'legacy-owned opportunity cannot become EH-native or create a duplicate delivery');

insert into public.crm_form_mappings(id,connection_id,channel,form_key,version,form_name,field_map,effective_from,created_by)
values('8c000000-0000-0000-0000-000000000090',(select id from fx where k='connection'),'meta_instant_form','1086266294126723',1,'Current Yearly','{}',now()+interval '1 day','8c000000-0000-0000-0000-000000000001');
select pg_temp.denied($q$insert into public.crm_lifecycle_producer_boundaries(connection_id,form_mapping_id,form_key,page_id,dataset_id,provider_contract_id,eligibility_policy_id,policy_version,notice_version,notice_text_digest,lifecycle_model,permitted_producer,valid_from,valid_until,legacy_exclusion_verified,legacy_exclusion_reference,legacy_exclusion_verified_at,legacy_exclusion_valid_until,verified_by)
 values((select id from fx where k='connection'),'8c000000-0000-0000-0000-000000000090','1086266294126723','882001','882003','8c000000-0000-0000-0000-000000000010','8c000000-0000-0000-0000-000000000011',1,'notice-r4',repeat('a',64),'r4_stage_entry','eh_native',now()+interval '1 day',now()+interval '2 days',true,'must-fail-yearly',now(),now()+interval '2 days','test')$q$,'23514');
select pg_temp.denied(format('update public.crm_lifecycle_producer_ownership set producer=''legacy'' where lead_id=%L',(select id from fx where k='history')),'42501');
select pg_temp.denied(format($q$insert into public.crm_lifecycle_producer_ownership(lead_id,connection_id,boundary_id,activation_epoch_id,producer) values(%L,%L,'8c000000-0000-0000-0000-000000000012',%L,'legacy')$q$,
 (select id from fx where k='history'),(select id from fx where k='connection'),(select id from fx where k='epoch')),'23505');
select pg_temp.actor(2);select pg_temp.denied(format('select public.crm_retry_external_delivery(%L)',(select id from claim1)),'42501');
select pg_temp.denied(format('select public.crm_configure_lifecycle(%L,3,''{}''::jsonb)',(select id from fx where k='connection')),'42501');
select pg_temp.actor(0);select pg_temp.denied($q$update public.crm_external_deliveries set attempt_boundary_state='not_started',attempt_boundary_at=null,status='pending',next_attempt_at=now() where id=(select id from claim1)$q$,'42501');
create temp table original_lifecycle_settings as select lifecycle_settings from public.crm_integration_connections where id=(select id from fx where k='connection');
update public.crm_integration_connections set lifecycle_settings=jsonb_set(lifecycle_settings,'{dataset_id}','"999999"') where id=(select id from fx where k='connection');
select pg_temp.actor(1);
select pg_temp.ok((select crm_security.lifecycle_route((select id from fx where k='paged'))->>'reason'='producer_boundary_missing')
 and (select (public.crm_lifecycle_diagnostics()->'producer_controls'->>'valid_boundaries')::integer=0),
 'dataset drift invalidates the exact producer boundary at routing and readiness diagnostics');
select pg_temp.actor(0);
update public.crm_integration_connections c set lifecycle_settings=o.lifecycle_settings from original_lifecycle_settings o where c.id=(select id from fx where k='connection');
create temp table original_boundary_validity as select valid_until from public.crm_lifecycle_producer_boundaries where id='8c000000-0000-0000-0000-000000000012';
set local session_replication_role=replica;
update public.crm_lifecycle_producer_boundaries set valid_until=clock_timestamp()-interval '1 second' where id='8c000000-0000-0000-0000-000000000012';
set local session_replication_role=origin;
select pg_temp.actor(1);
select pg_temp.ok((select crm_security.lifecycle_route((select id from fx where k='paged'))->>'reason'='producer_boundary_invalid')
 and (select crm_security.lifecycle_hold(d)='producer_boundary_invalid' from public.crm_external_deliveries d
   where d.lead_id=(select id from fx where k='paged') and d.event_kind='intake')
 and (select (public.crm_lifecycle_diagnostics()->'producer_controls'->>'revoked_or_expired_boundaries')::integer>=1),
 'expired finite producer boundary holds routing/materialized delivery and appears in diagnostics');
select pg_temp.actor(0);
set local session_replication_role=replica;
update public.crm_lifecycle_producer_boundaries b set valid_until=o.valid_until from original_boundary_validity o where b.id='8c000000-0000-0000-0000-000000000012';
set local session_replication_role=origin;
create temp table revocation_clock as select clock_timestamp() started_at;
update public.crm_lifecycle_producer_boundaries set revoked_at=clock_timestamp(),revocation_reason='operator_revoked'
where id='8c000000-0000-0000-0000-000000000012';
select pg_temp.ok((select crm_security.lifecycle_route((select id from fx where k='paged'))->>'reason'='producer_boundary_invalid'),
 'revoked producer boundary holds previously admitted native ownership');
select pg_temp.ok((select b.revoked_at>=r.started_at and b.revoked_at<=clock_timestamp() from public.crm_lifecycle_producer_boundaries b cross join revocation_clock r
 where b.id='8c000000-0000-0000-0000-000000000012'),'boundary revocation records the real database time');
select pg_temp.ok((select count(*)=2 and bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('crm_lifecycle_producer_boundaries','crm_lifecycle_producer_ownership')),'producer controls have RLS');
select pg_temp.ok(not has_table_privilege('authenticated','public.crm_lifecycle_producer_ownership','select') and not has_table_privilege('service_role','public.crm_lifecycle_producer_boundaries','select'),'producer controls have no direct API grants');
rollback;
\echo PASS CRM Meta funnel revision-4 facts, D2, ownership, ordering, uncertainty, stale leases, ACL and exclusions

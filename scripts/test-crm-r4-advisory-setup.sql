-- Advisory D2 acceptance: synthetic local data, no HTTP; transaction rolls back. Synthetic local
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
create function pg_temp.retry_allowed(delivery uuid) returns boolean language plpgsql as $$ begin
 perform public.crm_retry_external_delivery(delivery);return true;
exception when sqlstate '22023' then return false;end $$;
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
 sharing_field_key,sharing_accepted_values,notice_field_key,notice_accepted_values,effective_from,effective_until,created_by,lifecycle_model,allowed_event_kinds,d2_requirement)
values('8c000000-0000-0000-0000-000000000011',(select id from fx where k='connection'),(select id from fx where k='mapping'),1,null,null,
 null,null,null,null,null,null,clock_timestamp()-interval '1 day',clock_timestamp()+interval '7 days',
 '8c000000-0000-0000-0000-000000000001','r4_stage_entry','["intake","not_qualified","lost","qualified","converted"]','advisory');
insert into public.crm_lifecycle_producer_boundaries(id,connection_id,form_mapping_id,form_key,page_id,dataset_id,provider_contract_id,eligibility_policy_id,
 policy_version,notice_version,notice_text_digest,lifecycle_model,permitted_producer,valid_from,valid_until,
 legacy_exclusion_verified,legacy_exclusion_reference,legacy_exclusion_verified_at,legacy_exclusion_valid_until,verified_by)
values('8c000000-0000-0000-0000-000000000012',(select id from fx where k='connection'),(select id from fx where k='mapping'),'882002','882001','882003',
 '8c000000-0000-0000-0000-000000000010','8c000000-0000-0000-0000-000000000011',1,null,null,'r4_stage_entry','eh_native',
 clock_timestamp()-interval '1 minute',(select effective_until from public.crm_lifecycle_eligibility_policies where id='8c000000-0000-0000-0000-000000000011'),true,
 'synthetic-legacy-exclusion-proof',clock_timestamp()-interval '2 minutes',(select effective_until from public.crm_lifecycle_eligibility_policies where id='8c000000-0000-0000-0000-000000000011'),'local-test-operator');
select pg_temp.ok((select page_id='882001' and dataset_id='882003' and provider_contract_id='8c000000-0000-0000-0000-000000000010'
 and eligibility_policy_id='8c000000-0000-0000-0000-000000000011' and policy_version=1 and notice_version is null and notice_text_digest is null
 from public.crm_lifecycle_producer_boundaries where id='8c000000-0000-0000-0000-000000000012'),'producer boundary freezes exact Page/dataset/contract/policy/notice manifest');
select pg_temp.actor(0);
with created as (
 insert into public.crm_lifecycle_activation_epochs(connection_id,provider_contract_id,started_at,activated_by)
 values((select id from fx where k='connection'),'8c000000-0000-0000-0000-000000000010',now()-interval '2 minutes','release_operator') returning id
) insert into fx select 'epoch',id from created;
update public.crm_integration_connections set lifecycle_settings=lifecycle_settings||jsonb_build_object(
 'enabled',true,'live_started_at',now()-interval '2 minutes','activation_epoch_id',(select id from fx where k='epoch')),version=version+1
where id=(select id from fx where k='connection');

create function pg_temp.intake(external_id text,with_evidence boolean default false,occurred timestamptz default now()-interval '1 second') returns uuid language plpgsql as $$
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
 'action_source','system_generated','user_data',jsonb_build_object('lead_id',(select external_submission_id from public.crm_submission_attribution where submission_id=d.attribution_submission_id)),
 'custom_data',jsonb_build_object('event_source','crm','lead_event_source','English Hills CRM')))) $$;
create function pg_temp.finish_case(external_id text,result jsonb) returns uuid language plpgsql as $$
declare lead uuid;delivery uuid;lease uuid;begin
 lead:=pg_temp.intake(external_id);perform public.crm_reconcile_external_deliveries(100);
 select id into strict delivery from public.crm_external_deliveries where lead_id=lead and event_kind='intake';
 update public.crm_external_deliveries set next_attempt_at=now()+interval '1 day'
  where id<>delivery and status in ('pending','retry','blocked') and attempt_boundary_state='not_started';
 select x.lease_token into strict lease from jsonb_to_recordset(crm_security.claim_lifecycle_deliveries(100,true)) x(id uuid,lease_token uuid)
  where x.id=delivery;
 perform public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d))
  from public.crm_external_deliveries d where d.id=delivery and d.lease_token=lease;
 perform public.crm_begin_external_attempt(delivery,lease);
 perform public.crm_finish_external_attempt(delivery,lease,result);
 return delivery;
end $$;

create function pg_temp.source(external_id text,with_evidence boolean default false,occurred timestamptz default now()-interval '1 second') returns uuid language plpgsql as $$
declare submission uuid;lead uuid;begin
 insert into public.crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
 values('meta_instant_form',clock_timestamp(),occurred,'provider','{"contact_name":"Adult fixture","phone":"0612345678","email":"adult@example.invalid","learner_name":"PRIVATE CHILD","learner_age":12,"program_interest_text":"Annual","session_type":"Yearly"}',
 '[{"key":"adult_confirmed","label":"Adult","value":"yes","value_type":"string","label_source":"provider"},{"key":"meta_share","label":"Share","value":"yes","value_type":"string","label_source":"provider"},{"key":"notice_version","label":"Notice","value":"notice-r4","value_type":"string","label_source":"provider"}]',
 'R4 fixture','needs_review',encode(sha256(convert_to(external_id||occurred::text,'UTF8')),'hex'),(select id from fx where k='mapping')) returning id into submission;
 insert into public.crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,form_id,consent_evidence,attribution_status,provider_created_at)
 values(submission,'meta',external_id,'page:882001:'||submission,'882001','882002','{}','partial',occurred);
 return submission;end $$;

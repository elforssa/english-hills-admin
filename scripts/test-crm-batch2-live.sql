-- CRM Batch 2 live-mode acceptance matrix. Synthetic local fixtures only; all writes roll back.
\set ON_ERROR_STOP on
begin;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$
begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end $$;

create function pg_temp.denied(q text, code text default '42501') returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if sqlstate = code then return; end if;
    raise exception 'Expected %, got %: %', code, sqlstate, sqlerrm;
  end;
  raise exception 'Unexpected success: %', q;
end $$;

insert into auth.users(id,email,aud,role) values
  ('8c000000-0000-0000-0000-000000000001','batch2-live-director@example.invalid','authenticated','authenticated'),
  ('8c000000-0000-0000-0000-000000000003','batch2-live-reception@example.invalid','authenticated','authenticated');
update public.profiles set role = case right(id::text,1) when '1' then 'director' else 'receptionist' end
 where id::text like '8c000000-%';

create function pg_temp.actor(i integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',case when i=0 then '' else '8c000000-0000-0000-0000-'||lpad(i::text,12,'0') end,true);
  perform set_config('request.jwt.claim.role',case when i=0 then 'service_role' else 'authenticated' end,true);
end $$;

select pg_temp.actor(1);
select public.crm_create_followup_policy(gen_random_uuid(),
  '{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');

create temp table fx(k text primary key, id uuid);
insert into fx values('connection',(public.crm_save_meta_connection(
  '{"connection_key":"batch2-live-acceptance","page_id":"880001","api_version":"v99.0"}')->>'id')::uuid);
insert into fx values('mapping',(public.crm_publish_meta_form_mapping(
  (select id from fx where k='connection'),
  '{"form_key":"880002","field_map":{},"effective_from":"2020-01-01Z"}')->>'id')::uuid);

create temp table fixture_contract as select gen_random_uuid() id;
insert into public.crm_lifecycle_provider_contracts(
  id,
  contract_key,revision,api_version,qualified_event_name,converted_event_name,action_source,
  maximum_event_age_seconds,deduplication_window_seconds,accepted_response_field,
  lead_id_only,required_constants,evidence_urls,verified_on,approved_at)
select
  id,'batch2_live_fixture',1,'v99.0','FixtureQualified','FixtureConverted','system_generated',
  86400,300,'events_received',true,'{}','["https://developers.facebook.com/docs/fixture"]',current_date,clock_timestamp()
from fixture_contract;

select public.crm_configure_lifecycle(
  (select id from fx where k='connection'),1,
  jsonb_build_object('mode','live','enabled',false,'dataset_id','880003',
    'secret_ref','CRM_META_LIFECYCLE_TOKEN_BATCH2_FIXTURE',
    'contract_id',(select id from fixture_contract),'max_attempts',3));

select pg_temp.actor(0);
select pg_temp.denied(format(
  'select public.crm_activate_lifecycle_destination(%L,2,%L)',
  (select id from fx where k='connection'),(select id from fixture_contract)), '22023');
select pg_temp.ok(
  not exists(select 1 from public.crm_lifecycle_activation_epochs where connection_id=(select id from fx where k='connection')),
  'activation requires a currently effective form evidence policy'
);

create temp table fixture_policy as select gen_random_uuid() id;
insert into public.crm_lifecycle_eligibility_policies(
  id,
  connection_id,form_mapping_id,version,notice_version,notice_text_digest,
  adult_field_key,adult_accepted_values,sharing_field_key,sharing_accepted_values,
  notice_field_key,notice_accepted_values,effective_from,effective_until,created_by)
select
  id,(select id from fx where k='connection'),(select id from fx where k='mapping'),1,'notice-v1',repeat('a',64),
  'adult_confirmed','["yes"]','meta_share','["yes"]','notice_version','["notice-v1"]',
  clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','8c000000-0000-0000-0000-000000000001'
from fixture_policy;

select pg_temp.denied(format($q$
  insert into public.crm_lifecycle_eligibility_policies(
    connection_id,form_mapping_id,version,notice_version,notice_text_digest,
    adult_field_key,adult_accepted_values,sharing_field_key,sharing_accepted_values,
    effective_from,effective_until,created_by)
  values(%L,%L,99,'overlap',repeat('9',64),'adult_confirmed','["yes"]',
    'meta_share','["yes"]',clock_timestamp()-interval '12 hours',
    clock_timestamp()+interval '12 hours','8c000000-0000-0000-0000-000000000001')
$q$,(select id from fx where k='connection'),(select id from fx where k='mapping')),'23P01');
select pg_temp.ok(
  (select count(*)=1 from public.crm_lifecycle_eligibility_policies
    where connection_id=(select id from fx where k='connection')
      and form_mapping_id=(select id from fx where k='mapping')),
  'overlapping policy intervals are rejected instead of creating an ambiguous permissive fallback'
);

select pg_temp.actor(1);
create temp table no_epoch_fx(k text primary key,id uuid);
insert into no_epoch_fx values('connection',(public.crm_save_meta_connection(
  '{"connection_key":"batch2-live-no-epoch","page_id":"881001","api_version":"v99.0"}')->>'id')::uuid);
insert into no_epoch_fx values('mapping',(public.crm_publish_meta_form_mapping(
  (select id from no_epoch_fx where k='connection'),
  '{"form_key":"881002","field_map":{},"effective_from":"2020-01-01Z"}')->>'id')::uuid);
select public.crm_configure_lifecycle(
  (select id from no_epoch_fx where k='connection'),1,
  jsonb_build_object('mode','live','enabled',false,'dataset_id','881003',
    'secret_ref','CRM_META_LIFECYCLE_TOKEN_BATCH2_NO_EPOCH',
    'contract_id',(select id from fixture_contract),'max_attempts',3));
insert into no_epoch_fx values('policy',gen_random_uuid());
insert into public.crm_lifecycle_eligibility_policies(
  id,connection_id,form_mapping_id,version,notice_version,notice_text_digest,
  adult_field_key,adult_accepted_values,sharing_field_key,sharing_accepted_values,
  effective_from,effective_until,created_by)
select
  (select id from no_epoch_fx where k='policy'),
  (select id from no_epoch_fx where k='connection'),
  (select id from no_epoch_fx where k='mapping'),1,'notice-v1',repeat('8',64),
  'adult_confirmed','["yes"]','meta_share','["yes"]',
  clock_timestamp()-interval '300 days',clock_timestamp()+interval '1 day',
  '8c000000-0000-0000-0000-000000000001';
insert into no_epoch_fx values('evidence',gen_random_uuid());
insert into public.crm_lifecycle_eligibility_evidence(
  id,connection_id,policy_id,event_type,effective_at,recorded_at,source_kind,reason_code,
  source_external_id,source_projection,source_request_key)
select
  (select id from no_epoch_fx where k='evidence'),
  (select id from no_epoch_fx where k='connection'),
  (select id from no_epoch_fx where k='policy'),'grant',
  clock_timestamp()-interval '200 days',clock_timestamp()-interval '200 days',
  'form_response','explicit_form_evidence','881099',
  '{"page_id":"881001","form_id":"881002","notice_version":"notice-v1"}',gen_random_uuid();
select pg_temp.ok(
  not exists(select 1 from public.crm_lifecycle_activation_epochs
    where connection_id=(select id from no_epoch_fx where k='connection')),
  'configured live retention fixture has no activation epoch'
);

select pg_temp.actor(0);

create function pg_temp.intake(external_id text,page_id text default '880001',form_id text default '880002') returns uuid language plpgsql as $$
declare submission uuid; lead uuid;
begin
  insert into public.crm_submissions(
    channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,
    match_status,payload_hash,form_mapping_id)
  values(
    'meta_instant_form',clock_timestamp(),clock_timestamp(),'provider',
    '{"contact_name":"Adult fixture","phone":"0612345678","email":"adult@example.invalid","learner_name":"Private learner","learner_age":12,"program_interest_text":"Annual","session_type":"Yearly"}',
    '[{"key":"adult_confirmed","label":"Adult","value":"yes","value_type":"string","label_source":"provider"},{"key":"meta_share","label":"Share","value":"yes","value_type":"string","label_source":"provider"},{"key":"notice_version","label":"Notice","value":"notice-v1","value_type":"string","label_source":"provider"}]',
    'Meta fixture','needs_review',repeat(substr(external_id,1,1),64),(select id from fx where k='mapping'))
  returning id into submission;
  insert into public.crm_submission_attribution(
    submission_id,provider,external_submission_id,external_scope,page_id,form_id,consent_evidence,attribution_status)
  values(submission,'meta',external_id,'page:'||page_id||':'||submission,page_id,form_id,'{}','partial');
  lead := crm_security.accept_external_submission(submission);
  return lead;
end $$;

create function pg_temp.milestone(lead uuid, source text) returns uuid language sql as $$
  insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,source_key,from_status,to_status)
  values(lead,clock_timestamp(),'system','lead_qualified',source,'ENGAGED','QUALIFIED') returning id
$$;

insert into fx values('disabled_lead',pg_temp.intake('880010'));
insert into fx values('disabled_activity',pg_temp.milestone((select id from fx where k='disabled_lead'),'batch2-live-disabled'));
select public.crm_reconcile_external_deliveries();
select pg_temp.ok(
  (select status='blocked' and last_error_code='outbound_disabled'
      and provider_contract_id=(select id from fixture_contract)
      and activation_epoch_id is null and eligibility_evidence_id is null
      and payload is null and payload_hash is null
     from public.crm_external_deliveries where lead_id=(select id from fx where k='disabled_lead')),
  'disabled live reconciliation records a fail-closed row without fabricating live references'
);

insert into fx values('epoch',public.crm_activate_lifecycle_destination(
  (select id from fx where k='connection'),2,(select id from fixture_contract)));
select pg_temp.ok(
  (select coalesce((lifecycle_settings->>'enabled')::boolean,false)
     from public.crm_integration_connections where id=(select id from fx where k='connection')),
  'explicit operator activation opens a prospective epoch'
);

create temp table disabled_evidence as
select public.crm_record_lifecycle_evidence_check(
  (select first_submission_id from public.crm_leads where id=(select id from fx where k='disabled_lead')),
  (select id from fixture_policy),true,'eligible',repeat('7',64)) result;
select pg_temp.ok(
  not crm_security.repair_lifecycle_evidence(
    (select id from public.crm_external_deliveries where lead_id=(select id from fx where k='disabled_lead')),
    (select (result->>'evidence_id')::uuid from disabled_evidence)),
  'evidence from a disabled-period milestone cannot cross into a later activation epoch'
);

insert into fx values('unrepairable_lead',pg_temp.intake('880014'));
insert into fx values('unrepairable_activity',pg_temp.milestone((select id from fx where k='unrepairable_lead'),'batch2-live-unrepairable-evidence'));
select public.crm_reconcile_external_deliveries();
select pg_temp.ok(
  (select status='blocked' and last_error_code='sharing_evidence_missing' and eligibility_evidence_id is null
     from public.crm_external_deliveries where lead_id=(select id from fx where k='unrepairable_lead')),
  'an older delivery without evidence remains safely blocked'
);

insert into fx values('late_lead',pg_temp.intake('880015'));
insert into fx values('late_activity',pg_temp.milestone((select id from fx where k='late_lead'),'batch2-live-late-evidence'));
select public.crm_reconcile_external_deliveries();
create temp table late_delivery_before as
select id,provider_event_id from public.crm_external_deliveries where lead_id=(select id from fx where k='late_lead');
select pg_temp.ok(
  (select status='blocked' and last_error_code='sharing_evidence_missing' and eligibility_evidence_id is null
      and attempt_count=0 and payload is null and provider_event_name is null
     from public.crm_external_deliveries where id=(select id from late_delivery_before)),
  'reconciliation records one pre-attempt delivery while evidence evaluation is still pending'
);
select pg_temp.ok(
  not crm_security.repair_lifecycle_evidence(
    (select id from late_delivery_before),(select (result->>'evidence_id')::uuid from disabled_evidence)),
  'evidence from another submission cannot repair the blocked delivery'
);
select pg_temp.ok(
  not crm_security.repair_lifecycle_evidence(
    (select id from late_delivery_before),(select id from no_epoch_fx where k='evidence')),
  'evidence from another destination cannot repair the blocked delivery'
);
select pg_temp.denied(format(
  'update public.crm_external_deliveries set eligibility_evidence_id=%L,status=''pending'',last_error_code=null where id=%L',
  (select (result->>'evidence_id')::uuid from disabled_evidence),(select id from late_delivery_before)),'42501');

create temp table late_evidence as
select public.crm_record_lifecycle_evidence_check(
  (select first_submission_id from public.crm_leads where id=(select id from fx where k='late_lead')),
  (select id from fixture_policy),true,'eligible',repeat('6',64)) result;
select public.crm_reconcile_external_deliveries(1);
select pg_temp.ok(
  (select count(*)=1 and bool_and(id=(select id from late_delivery_before)
      and provider_event_id=(select provider_event_id from late_delivery_before)
      and status='pending' and last_error_code is null
      and eligibility_evidence_id=(select (result->>'evidence_id')::uuid from late_evidence))
     from public.crm_external_deliveries where lead_id=(select id from fx where k='late_lead')),
  'route-filtered repair skips an older ineligible row and repairs the same deterministic delivery without duplication'
);

create function pg_temp.live_payload(d public.crm_external_deliveries) returns jsonb language sql as $$
  select jsonb_build_object('data',jsonb_build_array(jsonb_build_object(
    'event_name',d.mapping_snapshot->'events'->>d.event_kind,
    'event_id',d.provider_event_id,
    'event_time',floor(extract(epoch from d.event_time))::bigint,
    'action_source',d.mapping_snapshot->>'action_source',
    'user_data',jsonb_build_object('lead_id',e.source_external_id))))
  from public.crm_lifecycle_eligibility_evidence e where e.id=d.eligibility_evidence_id
$$;

select public.crm_claim_external_deliveries(1,true);
create temp table pre_attempt_lease as
select lease_token from public.crm_external_deliveries where id=(select id from late_delivery_before);
update public.crm_external_deliveries set lease_until=clock_timestamp()-interval '1 second' where id=(select id from late_delivery_before);
select public.crm_claim_external_deliveries(1,true);
select pg_temp.ok(
  (select status='sending' and lease_token is distinct from (select lease_token from pre_attempt_lease)
      and attempt_count=0 and not exists(select 1 from public.crm_external_delivery_attempts a where a.delivery_id=d.id)
     from public.crm_external_deliveries d where id=(select id from late_delivery_before)),
  'an expired lease with no durable attempt is safely reclaimed under a new fence token'
);
select pg_temp.denied(format(
  'select public.crm_begin_external_attempt(%L,%L)',(select id from late_delivery_before),(select lease_token from pre_attempt_lease)),'40001');
select pg_temp.denied(format(
  'select public.crm_finish_external_attempt(%L,%L,''{"outcome":"sent","http_status":200}'')',
  (select id from late_delivery_before),(select lease_token from pre_attempt_lease)),'40001');
select public.crm_prepare_external_delivery(id,lease_token,pg_temp.live_payload(d))
  from public.crm_external_deliveries d where id=(select id from late_delivery_before);
select public.crm_begin_external_attempt(id,lease_token)
  from public.crm_external_deliveries where id=(select id from late_delivery_before);
create temp table begun_attempt_lease as
select lease_token from public.crm_external_deliveries where id=(select id from late_delivery_before);
select pg_temp.ok(
  not crm_security.repair_lifecycle_evidence(
    (select id from late_delivery_before),(select (result->>'evidence_id')::uuid from disabled_evidence)),
  'evidence identity cannot be repaired after a durable provider attempt begins'
);
select pg_temp.denied(format(
  'update public.crm_external_deliveries set eligibility_evidence_id=%L where id=%L',
  (select (result->>'evidence_id')::uuid from disabled_evidence),(select id from late_delivery_before)),'42501');
update public.crm_external_deliveries set lease_until=clock_timestamp()-interval '1 second' where id=(select id from late_delivery_before);
create temp table attempted_expiry_claim as select public.crm_claim_external_deliveries(1,true) result;
select pg_temp.ok(
  (select result='[]'::jsonb from attempted_expiry_claim)
  and (select status='unknown' and last_error_code='lease_expired' and next_attempt_at>clock_timestamp()
      and attempt_count=1 from public.crm_external_deliveries where id=(select id from late_delivery_before))
  and (select outcome='unknown' and error_code='lease_expired' and finished_at is not null
      from public.crm_external_delivery_attempts where delivery_id=(select id from late_delivery_before)),
  'an expired lease after durable attempt begin preserves uncertainty and deduplication delay'
);
select pg_temp.denied(format(
  'select public.crm_finish_external_attempt(%L,%L,''{"outcome":"sent","http_status":200}'')',
  (select id from late_delivery_before),(select lease_token from begun_attempt_lease)),'40001');

select pg_temp.actor(1);
select pg_temp.denied(format(
  'select public.crm_retry_external_delivery(%L)',
  (select id from public.crm_external_deliveries where lead_id=(select id from fx where k='disabled_lead'))), '22023');
select pg_temp.ok(
  (select status='blocked' from public.crm_external_deliveries where lead_id=(select id from fx where k='disabled_lead')),
  'activation does not release a disabled-period backlog'
);

insert into fx values('live_lead',pg_temp.intake('880011'));
select pg_temp.actor(0);
select public.crm_record_lifecycle_evidence_check(
  (select first_submission_id from public.crm_leads where id=(select id from fx where k='live_lead')),
  (select id from fixture_policy),true,'eligible',repeat('b',64));
insert into fx values('live_activity',pg_temp.milestone((select id from fx where k='live_lead'),'batch2-live-eligible'));
insert into fx values('wrong_page_lead',pg_temp.intake('880013','999999','880002'));
select public.crm_record_lifecycle_evidence_check(
  (select first_submission_id from public.crm_leads where id=(select id from fx where k='wrong_page_lead')),
  (select id from fixture_policy),true,'eligible',repeat('f',64));
insert into fx values('wrong_page_activity',pg_temp.milestone((select id from fx where k='wrong_page_lead'),'batch2-live-wrong-page'));
select public.crm_reconcile_external_deliveries();
select pg_temp.ok(
  (select status='pending' and delivery_mode='live' and provider_contract_id=(select id from fixture_contract)
      and activation_epoch_id=(select id from fx where k='epoch') and eligibility_evidence_id is not null
      and event_time >= (select started_at from public.crm_lifecycle_activation_epochs where id=(select id from fx where k='epoch'))
     from public.crm_external_deliveries where lead_id=(select id from fx where k='live_lead')),
  'post-activation milestone with explicit evidence is the only live-eligible path'
);
select pg_temp.ok(
  (select status='suppressed' and last_error_code='no_matching_identity'
     from public.crm_external_deliveries where lead_id=(select id from fx where k='wrong_page_lead')),
  'wrong Page evidence never becomes a sendable live delivery'
);

create temp table held_evidence as select gen_random_uuid() id;
insert into public.crm_lifecycle_eligibility_evidence(
  id,connection_id,policy_id,event_type,effective_at,source_kind,reason_code,
  source_external_id,source_projection,source_request_key)
select id,(select id from fx where k='connection'),(select id from fixture_policy),'grant',clock_timestamp(),
  'form_response','explicit_form_evidence','880098','{"page_id":"880001","form_id":"880002","notice_version":"notice-v1"}',gen_random_uuid()
from held_evidence;
insert into public.crm_external_deliveries(
  created_at,activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,
  mapping_version,mapping_snapshot,attribution_submission_id,matching_submission_id,
  status,next_attempt_at,max_attempts,delivery_mode,provider_contract_id,activation_epoch_id,
  eligibility_evidence_id,send_deadline)
select
  clock_timestamp()-interval '1 day',(select id from fx where k='disabled_activity'),(select id from fx where k='disabled_lead'),
  c.id,'converted',a.occurred_at,'eh:batch2:held-live',coalesce((c.lifecycle_settings->>'version')::integer,0),c.lifecycle_settings,
  l.first_submission_id,l.first_submission_id,'pending',clock_timestamp()-interval '1 day',3,'live',(select id from fixture_contract),
  (select id from fx where k='epoch'),
  (select id from held_evidence),
  clock_timestamp()+interval '1 day'
from public.crm_integration_connections c
join public.crm_leads l on l.id=(select id from fx where k='disabled_lead')
join public.crm_activities a on a.id=(select id from fx where k='disabled_activity')
where c.id=(select id from fx where k='connection');
select public.crm_claim_external_deliveries(1,true);
select pg_temp.ok(
  (select status='suppressed' and last_error_code='activation_ended'
     from public.crm_external_deliveries where provider_event_id='eh:batch2:held-live'),
  'one bounded claim scan retires an ineligible head row and still leases fresh eligible work'
);
select pg_temp.denied(
  $$select public.crm_prepare_external_delivery(id,lease_token,
      jsonb_set(pg_temp.live_payload(d),'{data,0,value}','1'::jsonb))
    from public.crm_external_deliveries d where lead_id=(select id from fx where k='live_lead')$$,
  '22023'
);
select pg_temp.denied(
  $$select public.crm_prepare_external_delivery(id,lease_token,
      jsonb_set(pg_temp.live_payload(d),'{data,0,user_data,em}',to_jsonb(repeat('a',64))))
    from public.crm_external_deliveries d where lead_id=(select id from fx where k='live_lead')$$,
  '22023'
);
select public.crm_prepare_external_delivery(id,lease_token,pg_temp.live_payload(d))
  from public.crm_external_deliveries d where lead_id=(select id from fx where k='live_lead');
select public.crm_begin_external_attempt(id,lease_token)
  from public.crm_external_deliveries where lead_id=(select id from fx where k='live_lead');
select public.crm_finish_external_attempt(id,lease_token,
  '{"outcome":"unknown","error_code":"timeout","retry_after":86400}')
  from public.crm_external_deliveries where lead_id=(select id from fx where k='live_lead');
select pg_temp.ok(
  (select status='unknown' and next_attempt_at is null and last_error_code='deduplication_window_elapsed'
     from public.crm_external_deliveries where lead_id=(select id from fx where k='live_lead')),
  'unknown live outcome is never retried outside the pinned provider deduplication window'
);
select pg_temp.actor(1);
select pg_temp.denied(format(
  'select public.crm_retry_external_delivery(%L)',
  (select id from public.crm_external_deliveries where lead_id=(select id from fx where k='live_lead'))), '22023');

create temp table expired_policy as select gen_random_uuid() id;
insert into public.crm_lifecycle_eligibility_policies(
  id,
  connection_id,form_mapping_id,version,notice_version,notice_text_digest,
  adult_field_key,adult_accepted_values,sharing_field_key,sharing_accepted_values,
  effective_from,effective_until,created_by)
select
  id,(select id from fx where k='connection'),(select id from fx where k='mapping'),2,'expired',repeat('c',64),
  'adult_confirmed','["yes"]','meta_share','["yes"]',
  clock_timestamp()-interval '300 days',clock_timestamp()-interval '200 days','8c000000-0000-0000-0000-000000000001'
from expired_policy;
insert into public.crm_lifecycle_eligibility_checks(submission_id,policy_id,checked_at,eligible,reason_code,evidence_digest,source_marker)
values(
  (select first_submission_id from public.crm_leads where id=(select id from fx where k='disabled_lead')),
  (select id from expired_policy),clock_timestamp()-interval '200 days',false,'sharing_missing',repeat('d',64),
  encode(sha256(convert_to('crm:lifecycle:eligibility:'||(select first_submission_id from public.crm_leads where id=(select id from fx where k='disabled_lead'))||':'||(select id from expired_policy),'UTF8')),'hex'));

insert into fx values('revocation',public.crm_revoke_lifecycle_evidence(
  gen_random_uuid(),
  (select eligibility_evidence_id from public.crm_external_deliveries where lead_id=(select id from fx where k='live_lead')),
  'privacy_request'));
create temp table old_unreferenced_evidence as select gen_random_uuid() grant_id,gen_random_uuid() revoke_id;
insert into public.crm_lifecycle_eligibility_evidence(
  id,connection_id,policy_id,event_type,effective_at,recorded_at,source_kind,reason_code,
  source_external_id,source_projection,source_request_key)
select grant_id,(select id from fx where k='connection'),(select id from fixture_policy),'grant',
  clock_timestamp()-interval '200 days',clock_timestamp()-interval '200 days','form_response','explicit_form_evidence',
  '880099','{"page_id":"880001","form_id":"880002","notice_version":"notice-v1"}',gen_random_uuid()
from old_unreferenced_evidence;
insert into public.crm_lifecycle_eligibility_evidence(
  id,connection_id,policy_id,event_type,effective_at,recorded_at,source_kind,reason_code,
  source_request_key,actor_id,supersedes_evidence_id)
select revoke_id,(select id from fx where k='connection'),(select id from fixture_policy),'revoke',
  clock_timestamp()-interval '100 days',clock_timestamp()-interval '100 days','director_revocation','privacy_request',
  gen_random_uuid(),'8c000000-0000-0000-0000-000000000001',grant_id
from old_unreferenced_evidence;
update public.crm_external_deliveries
   set status='suppressed',terminal_at=clock_timestamp()-interval '91 days',next_attempt_at=null,last_error_code='sharing_revoked'
 where lead_id=(select id from fx where k='live_lead');

insert into fx values('mock_lead',pg_temp.intake('880012'));
insert into fx values('mock_activity',pg_temp.milestone((select id from fx where k='mock_lead'),'batch2-old-mock-source'));
create temp table old_mock_delivery as select gen_random_uuid() id;
insert into public.crm_external_deliveries(
  id,
  created_at,activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,
  mapping_version,mapping_snapshot,attribution_submission_id,matching_submission_id,
  payload,payload_hash,status,next_attempt_at,last_error_code,max_attempts,delivery_mode)
select
  old.id,clock_timestamp()-interval '100 days',(select id from fx where k='mock_activity'),(select id from fx where k='mock_lead'),
  (select id from fx where k='connection'),'converted',clock_timestamp()-interval '100 days','eh:batch2:old-mock',
  1,'{"mode":"mock"}',l.first_submission_id,l.first_submission_id,
  '{"data":[]}',encode(sha256(convert_to('{"data":[]}'::jsonb::text,'UTF8')),'hex'),
  'blocked',clock_timestamp()-interval '100 days','outbound_disabled',3,'mock_legacy'
 from old_mock_delivery old cross join public.crm_leads l where l.id=(select id from fx where k='mock_lead');
insert into public.crm_external_delivery_attempts(
  delivery_id,attempt_number,lease_token,started_at,finished_at,outcome,error_code)
values(
  (select id from old_mock_delivery),1,gen_random_uuid(),clock_timestamp()-interval '100 days',
  clock_timestamp()-interval '100 days','unknown','timeout');

select pg_temp.actor(0);
create temp table cleanup_result as select public.crm_cleanup_lifecycle_retention(100) result;
select pg_temp.ok(
  (select (result->>'terminated')::integer >= 1 and (result->>'payloads_erased')::integer >= 1
      and (result->>'attempts_erased')::integer >= 1 and (result->>'checks_erased')::integer >= 1
      and (result->>'evidence_erased')::integer >= 5 from cleanup_result),
  'retention reports terminalization plus payload, attempt, negative-check and grant/revocation erasure'
);
select pg_temp.ok(
  (select status='suppressed' and last_error_code='retention_expired' and terminal_at is not null
     from public.crm_external_deliveries where id=(select id from old_mock_delivery)),
  'legacy mock nonterminal rows cannot remain indefinitely'
);
select pg_temp.ok(
  (select diagnostics_erased_at is not null and started_at is null and finished_at is null and outcome is null
      and error_code is null from public.crm_external_delivery_attempts where delivery_id=(select id from old_mock_delivery)),
  '90-day attempt outcome and timing diagnostics are erased while the audit shell remains'
);
select pg_temp.ok(
  (select redacted_at is not null and submission_id is null and evidence_digest is null
     from public.crm_lifecycle_eligibility_checks where policy_id=(select id from expired_policy)),
  'expired negative evidence checks are minimized after 90 days'
);
select pg_temp.ok(
  (select count(*)=2 and bool_and(redacted_at is not null and submission_id is null and source_external_id is null and source_projection is null)
     from public.crm_lifecycle_eligibility_evidence
    where id in ((select eligibility_evidence_id from public.crm_external_deliveries where lead_id=(select id from fx where k='live_lead')),
                 (select id from fx where k='revocation'))),
  'grant and revocation evidence are minimized together after every linked delivery is terminal for 90 days'
);
select pg_temp.ok(
  (select count(*)=2 and bool_and(redacted_at is not null and submission_id is null and source_external_id is null and source_projection is null)
     from public.crm_lifecycle_eligibility_evidence
    where id in ((select grant_id from old_unreferenced_evidence),(select revoke_id from old_unreferenced_evidence))),
  'unreferenced grant and revocation evidence expire at the bounded provider horizon instead of policy end'
);
select pg_temp.ok(
  (select redacted_at is not null and submission_id is null and source_external_id is null and source_projection is null
     from public.crm_lifecycle_eligibility_evidence where id=(select id from no_epoch_fx where k='evidence')),
  'configured live provider horizon bounds unreferenced evidence even before the first activation epoch'
);
select pg_temp.ok(
  (select payload is null and payload_hash is null and matching_submission_id is null and payload_erased_at is not null
     from public.crm_external_deliveries where lead_id=(select id from fx where k='live_lead')),
  'terminal delivery payload and matching reference are erased after 30 days'
);
create temp table post_cleanup_claim as select public.crm_claim_lifecycle_evidence(100) result;
select pg_temp.ok(
  not exists(
    select 1 from post_cleanup_claim c cross join lateral jsonb_array_elements(c.result) item
     where item->>'submission_id'=(select first_submission_id::text from public.crm_leads where id=(select id from fx where k='live_lead'))
  ),
  'retained nonmatching tombstone permanently excludes cleaned source evidence from claiming'
);
create temp table grants_after_cleanup as
select count(*) total from public.crm_lifecycle_eligibility_evidence where policy_id=(select id from fixture_policy) and event_type='grant';
create temp table post_cleanup_record as
select public.crm_record_lifecycle_evidence_check(
  (select first_submission_id from public.crm_leads where id=(select id from fx where k='live_lead')),
  (select id from fixture_policy),true,'eligible',repeat('e',64)) result;
select pg_temp.ok(
  (select result->>'eligible'='false' and result->>'evidence_id' is null from post_cleanup_record)
  and (select total=(select count(*) from public.crm_lifecycle_eligibility_evidence where policy_id=(select id from fixture_policy) and event_type='grant') from grants_after_cleanup),
  'direct replay after cleanup cannot reconstruct a grant or matching projection'
);
create temp table second_cleanup as select public.crm_cleanup_lifecycle_retention(100) result;
select pg_temp.ok(
  (select (result->>'terminated')::integer=0 and (result->>'payloads_erased')::integer=0
      and (result->>'attempts_erased')::integer=0 and (result->>'checks_erased')::integer=0
      and (result->>'evidence_erased')::integer=0 from second_cleanup),
  'retention cleanup is idempotent at the completed boundary'
);
select pg_temp.actor(1);
select pg_temp.denied(format(
  'select public.crm_retry_external_delivery(%L)',
  (select id from public.crm_external_deliveries where lead_id=(select id from fx where k='live_lead'))), '22023');
select pg_temp.denied(format('select public.crm_retire_lifecycle_policy(%L,0)',(select id from fixture_policy)),'40001');
select public.crm_retire_lifecycle_policy((select id from fixture_policy),1);
select pg_temp.ok(
  (select retired_at is not null and retired_by='8c000000-0000-0000-0000-000000000001'
     from public.crm_lifecycle_eligibility_policies where id=(select id from fixture_policy)),
  'policy retirement uses an expected version and records the director actor'
);

set constraints all immediate;
rollback;
\echo 'PASS CRM Batch 2 live activation, fail-closed disabled path, deduplication and retention matrix'

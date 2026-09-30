-- Persistent representative migration-100 state for a direct 100 -> 102 upgrade.
\set ON_ERROR_STOP on
begin;

do $$
begin
 if (select max(version::integer) from supabase_migrations.schema_migrations) <> 100 then
  raise exception 'Expected migration 100 as the upgrade starting point';
 end if;
 if to_regclass('public.crm_lifecycle_producer_boundaries') is not null
  or exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_external_deliveries' and column_name='lifecycle_model') then
  raise exception 'Revision-4 controls exist before migration 101';
 end if;
 if to_regclass('public.crm_lifecycle_eligibility_evidence') is null then
  raise exception 'Migration-100 lifecycle evidence schema is missing';
 end if;
end $$;

insert into auth.users(id,email,aud,role)
values('8e000000-0000-0000-0000-000000000001','crm-r4-upgrade-100@example.invalid','authenticated','authenticated');
update public.profiles set role='director' where id='8e000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='8e000000-0000-0000-0000-000000000001';

select public.crm_create_followup_policy(
 '8e000000-0000-0000-0000-000000000002',
 '{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}'
);

do $$
declare connection_id uuid;created jsonb;opportunity_id uuid;qualified_activity uuid;converted_activity uuid;
begin
 connection_id:=(public.crm_save_meta_connection('{"connection_key":"r4-upgrade-100-dormant","page_id":"990001","api_version":"v99.0"}')->>'id')::uuid;
 perform public.crm_configure_lifecycle(connection_id,1,'{"enabled":false,"mode":"mock","dataset_id":"990002","api_version":"v99.0","secret_ref":"CRM_META_LIFECYCLE_TOKEN_UPGRADE_100","events":{"qualified":"Qualified","converted":"Converted"},"action_source":"system_generated","allow_later_meta":false,"max_attempts":5}');
 created:=public.crm_create_manual_lead('8e000000-0000-0000-0000-000000000003',
  '{"display_name":"CRM R4 migration 100 fixture","learner_name":"Synthetic learner","phone":"0612345678","source_label":"Upgrade verification"}');
 opportunity_id:=(created->'lead'->>'id')::uuid;
 perform public.crm_qualify_lead('8e000000-0000-0000-0000-000000000004',jsonb_build_object(
  'lead_id',opportunity_id,'expected_version',(select version from public.crm_leads where id=opportunity_id),
  'conversation_channel','phone','note','Synthetic migration-100 qualification','qualification_step','enrollment',
  'next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));
 select id into strict qualified_activity from public.crm_activities where lead_id=opportunity_id and event_type='lead_qualified';
 insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,source_key,from_status,to_status)
 values(opportunity_id,clock_timestamp(),'system','lead_converted','upgrade-100-converted','QUALIFIED','CONVERTED') returning id into converted_activity;
 insert into public.crm_external_deliveries(activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,mapping_version,mapping_snapshot,
  status,next_attempt_at,last_error_code,max_attempts,delivery_mode,terminal_at)
 values
  (qualified_activity,opportunity_id,null,'qualified',(select occurred_at from public.crm_activities where id=qualified_activity),
   'upgrade100:qualified',0,'{}','suppressed',null,'no_destination',5,'mock',clock_timestamp()),
  (converted_activity,opportunity_id,null,'converted',(select occurred_at from public.crm_activities where id=converted_activity),
   'upgrade100:converted',0,'{}','suppressed',null,'no_destination',5,'mock',clock_timestamp());
end $$;

do $$
begin
 if (select count(*) from public.crm_external_deliveries where provider_event_id like 'upgrade100:%') <> 2 then
  raise exception 'Expected two dormant migration-100 delivery rows';
 end if;
 if exists(select 1 from public.crm_lifecycle_provider_contracts)
  or exists(select 1 from public.crm_lifecycle_activation_epochs)
  or exists(select 1 from public.crm_lifecycle_eligibility_policies)
  or exists(select 1 from public.crm_lifecycle_eligibility_evidence) then
  raise exception 'Migration-100 fixture must start without live contract, policy, evidence, or epoch';
 end if;
end $$;
commit;
\echo PASS representative dormant migration-100 state

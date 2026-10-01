\set ON_ERROR_STOP on
begin;
do $$begin
 if (select max(version::integer) from supabase_migrations.schema_migrations)<>102 then raise exception 'Expected migration102';end if;
 if exists(select 1 from public.crm_lifecycle_provider_contracts) or exists(select 1 from public.crm_lifecycle_activation_epochs)
 or exists(select 1 from public.crm_lifecycle_producer_boundaries) or exists(select 1 from public.crm_lifecycle_producer_ownership)
 or exists(select 1 from public.crm_external_deliveries where delivery_mode='live') then raise exception 'Separate upgrade plan required: active inventory';end if;
end $$;
insert into auth.users(id,email,aud,role) values('8f000000-0000-0000-0000-000000000001','advisory-upgrade@example.invalid','authenticated','authenticated');
update public.profiles set role='director' where id='8f000000-0000-0000-0000-000000000001';
set local request.jwt.claim.sub='8f000000-0000-0000-0000-000000000001';set local request.jwt.claim.role='authenticated';
create temp table ids(k text,id uuid);
insert into ids values('connection',(public.crm_save_meta_connection('{"connection_key":"advisory-upgrade","page_id":"885001","api_version":"v99.0"}')->>'id')::uuid);
insert into ids values('mapping',(public.crm_publish_meta_form_mapping((select id from ids where k='connection'),'{"form_key":"885002","field_map":{},"effective_from":"2020-01-01Z"}')->>'id')::uuid);
insert into ids values('policy',(public.crm_publish_lifecycle_policy((select id from ids where k='connection'),1,jsonb_build_object('form_mapping_id',(select id from ids where k='mapping'),
 'notice_version','upgrade-required','notice_text_digest',repeat('a',64),'adult_field_key','adult','adult_accepted_values','[true]'::jsonb,'sharing_field_key','share','sharing_accepted_values','[true]'::jsonb,
 'effective_from',now()+interval '1 day','effective_until',now()+interval '7 days'))->>'id')::uuid);
insert into public.crm_lifecycle_eligibility_checks(policy_id,eligible,reason_code,evidence_digest,source_marker)
 values((select id from ids where k='policy'),false,'adult_missing',repeat('b',64),repeat('c',64));
insert into public.crm_lifecycle_eligibility_evidence(connection_id,policy_id,event_type,effective_at,source_kind,reason_code,source_external_id,source_projection,source_request_key)
 values((select id from ids where k='connection'),(select id from ids where k='policy'),'grant',now(),'form_response','explicit_form_evidence','885003','{"page_id":"885001","form_id":"885002","notice_version":"upgrade-required","captured_at":"2026-10-01T00:00:00Z"}',gen_random_uuid());
create table public.r4_upgrade_snapshot(k text primary key,data jsonb);
insert into public.r4_upgrade_snapshot values
 ('policies',(select jsonb_agg(to_jsonb(p) order by id) from public.crm_lifecycle_eligibility_policies p)),
 ('checks',(select jsonb_agg(to_jsonb(p) order by id) from public.crm_lifecycle_eligibility_checks p)),
 ('evidence',(select jsonb_agg(to_jsonb(p) order by id) from public.crm_lifecycle_eligibility_evidence p)),
 ('connection',(select jsonb_agg(to_jsonb(p) order by id) from public.crm_integration_connections p));
commit;
\echo PASS closed migration102 inventory and required historical policy/evidence snapshot

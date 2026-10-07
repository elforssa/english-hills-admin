-- Prove migrations 101/102 preserve migration-100 dormant two-event semantics.
\set ON_ERROR_STOP on
\ir test-crm-h3-04-manifest.sql
begin;

do $$
begin
 if (select max(version::integer) from supabase_migrations.schema_migrations) <> 111
  or (select count(*) from supabase_migrations.schema_migrations where version in ('101','102','103','104','105','106','107','108','109','110','111')) <> 11 then
  raise exception 'Expected direct migration 100 through 111';
 end if;
 if (select count(*) from public.crm_external_deliveries where provider_event_id like 'upgrade100:%') <> 2 then
  raise exception 'Migration-100 delivery identities were changed or duplicated';
 end if;
 if exists(
  select 1 from public.crm_external_deliveries
  where provider_event_id like 'upgrade100:%'
   and (event_kind not in ('qualified','converted') or lifecycle_model<>'legacy_first_attainment'
    or delivery_mode<>'mock' or status<>'suppressed' or last_error_code<>'no_destination'
    or attempt_boundary_state<>'not_started' or attempt_boundary_at is not null or attempt_count<>0
    or producer_ownership_id is not null or provider_contract_id is not null or activation_epoch_id is not null
    or eligibility_evidence_id is not null or payload is not null or payload_hash is not null)
 ) then
  raise exception 'Dormant two-event rows did not retain legacy/mock defaults';
 end if;
 if exists(select 1 from public.crm_external_deliveries where event_kind in ('intake','not_qualified','lost'))
  or exists(select 1 from public.crm_external_deliveries where lifecycle_model='r4_stage_entry') then
  raise exception 'Upgrade automatically converted the old cohort to five-event/native ownership';
 end if;
 if exists(select 1 from public.crm_lifecycle_provider_contracts where id <> '7cf9833e-4f77-4335-b1ec-c047d9353f54')
  or exists(select 1 from public.crm_lifecycle_activation_epochs)
  or exists(select 1 from public.crm_lifecycle_eligibility_policies)
  or exists(select 1 from public.crm_lifecycle_eligibility_evidence)
  or exists(select 1 from public.crm_lifecycle_producer_boundaries)
  or exists(select 1 from public.crm_lifecycle_producer_ownership) then
  raise exception 'Upgrade created live contract, policy, evidence, boundary, epoch, or ownership';
 end if;
 if exists(select 1 from public.crm_external_deliveries d where d.provider_event_id like 'upgrade100:%'
  and crm_security.lifecycle_retry_hold(d) is null) then
  raise exception 'A dormant migration-100 row became newly retry eligible';
 end if;
 if exists(select 1 from jsonb_to_recordset(crm_security.claim_lifecycle_deliveries(100,false)) x(id uuid,lease_token uuid)
  join public.crm_external_deliveries d on d.id=x.id where d.provider_event_id like 'upgrade100:%') then
  raise exception 'Legacy/mock dormant row became scheduler eligible';
 end if;
 if not exists(select 1 from public.crm_integration_connections where connection_key='r4-upgrade-100-dormant'
  and lifecycle_settings->>'mode'='mock' and coalesce((lifecycle_settings->>'enabled')::boolean,false)=false
  and lifecycle_settings->'events'='{"qualified":"Qualified","converted":"Converted"}'::jsonb
  and not (lifecycle_settings ? 'lifecycle_model')) then
  raise exception 'Dormant migration-100 configuration semantics changed';
 end if;
 if (select active from cron.job where jobname='crm-lifecycle-primary') is distinct from false then
  raise exception 'Lifecycle scheduler must remain inactive';
 end if;
end $$;

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='8e000000-0000-0000-0000-000000000001';
select public.crm_lifecycle_diagnostics();
select public.crm_list_external_deliveries(10,0);
rollback;
\echo PASS direct migration-100 to 103 dormant-state upgrade

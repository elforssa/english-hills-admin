-- Verify the persistent 097 fixture after applying migrations 098 -> current.
\set ON_ERROR_STOP on

\ir test-crm-h3-04-manifest.sql
begin;

do $$
declare delivery_count integer;
begin
  if (select max(version::integer) from supabase_migrations.schema_migrations) <> 109 then
    raise exception 'Expected migration 109 after upgrade to current';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in ('098','099','100','101','102','103','104','105','106','107','108','109')) <> 12 then
    raise exception 'Migrations 098 through 109 were not all recorded';
  end if;
  if to_regclass('public.crm_lifecycle_eligibility_evidence') is null then
    raise exception 'Batch 2 lifecycle evidence table is missing';
  end if;

  select count(*) into delivery_count
  from public.crm_external_deliveries d
  join public.crm_leads l on l.id=d.lead_id
  join public.crm_contacts c on c.id=l.contact_id
  where c.display_name='CRM Batch 2 upgrade fixture'
    and d.event_kind='qualified'
    and d.status='suppressed'
    and d.last_error_code='no_destination'
    and d.delivery_mode='mock_legacy'
    and d.lifecycle_model='legacy_first_attainment'
    and d.attempt_boundary_state='not_started'
    and d.provider_contract_id is null
    and d.activation_epoch_id is null
    and d.eligibility_evidence_id is null
    and d.terminal_at is not null
    and d.payload is null
    and d.payload_hash is null;
  if delivery_count <> 1 then
    raise exception 'Legacy delivery did not upgrade exactly once with safe defaults: %',delivery_count;
  end if;

  if exists(select 1 from public.crm_lifecycle_provider_contracts where id <> '7cf9833e-4f77-4335-b1ec-c047d9353f54') then
    raise exception 'Upgrade unexpectedly seeded a provider contract';
  end if;
  if exists(select 1 from public.crm_lifecycle_producer_boundaries)
     or exists(select 1 from public.crm_lifecycle_producer_ownership) then
    raise exception 'Upgrade unexpectedly created producer eligibility or ownership';
  end if;
  if (select active from cron.job where jobname='crm-lifecycle-primary') is distinct from false then
    raise exception 'Lifecycle scheduler must remain installed but inactive';
  end if;
  if has_function_privilege('authenticated','crm_security.repair_lifecycle_evidence(uuid,uuid)','execute')
     or has_function_privilege('service_role','crm_security.repair_lifecycle_evidence(uuid,uuid)','execute') then
    raise exception 'Private evidence repair helper is executable by an API role';
  end if;
end $$;

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='8d000000-0000-0000-0000-000000000001';
select public.crm_lifecycle_diagnostics();
select public.crm_list_external_deliveries(10,0);

rollback;
\echo PASS synthetic migration 097 to current upgrade

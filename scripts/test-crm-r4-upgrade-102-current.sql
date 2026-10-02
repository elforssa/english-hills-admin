\set ON_ERROR_STOP on
begin;
do $$begin
 if (select max(version::integer) from supabase_migrations.schema_migrations)<>104 then raise exception 'Expected migration104';end if;
 if exists(select 1 from public.crm_lifecycle_eligibility_policies where d2_requirement<>'required') then raise exception 'Historical policy reclassified';end if;
 if (select jsonb_agg(to_jsonb(p)-array['d2_requirement','sharing_refused_values','prohibited_field_key','prohibited_values','safety_decision_reference'] order by id) from public.crm_lifecycle_eligibility_policies p)
 is distinct from (select data from public.r4_upgrade_snapshot where k='policies') then raise exception 'Historical policy changed';end if;
 if (select jsonb_agg(to_jsonb(p) order by id) from public.crm_lifecycle_eligibility_checks p) is distinct from (select data from public.r4_upgrade_snapshot where k='checks')
 or (select jsonb_agg(to_jsonb(p) order by id) from public.crm_lifecycle_eligibility_evidence p) is distinct from (select data from public.r4_upgrade_snapshot where k='evidence')
 or (select jsonb_agg(to_jsonb(p) order by id) from public.crm_integration_connections p) is distinct from (select data from public.r4_upgrade_snapshot where k='connection') then raise exception 'Historical evidence/check/config changed';end if;
 if exists(select 1 from public.crm_lifecycle_sharing_stops) or exists(select 1 from public.crm_lifecycle_provider_contracts)
 or exists(select 1 from public.crm_lifecycle_activation_epochs) or exists(select 1 from public.crm_lifecycle_producer_boundaries)
 or exists(select 1 from public.crm_lifecycle_producer_ownership) or exists(select 1 from public.crm_external_deliveries where delivery_mode='live')
 or (select active from cron.job where jobname='crm-lifecycle-primary') is distinct from false then raise exception 'Upgrade activated or backfilled';end if;
end $$;
rollback;
\echo PASS 102 to 103 unchanged required policy/evidence/config and zero native activation/backfill

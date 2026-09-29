-- CRM Batch 2 catalog/security regression. Local-only; all fixture writes roll back.
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

select pg_temp.ok(
  not exists(select 1 from public.crm_lifecycle_provider_contracts),
  'no provider contract is guessed or seeded'
);
select pg_temp.ok(
  (select count(*) = 1 and bool_and(not active)
     from cron.job where jobname = 'crm-lifecycle-primary'),
  'one independent lifecycle cron exists and is inactive'
);
select pg_temp.ok(
  (select schedule = '*/5 * * * *'
      and command = 'select crm_security.invoke_crm_lifecycle_scheduler()'
     from cron.job where jobname = 'crm-lifecycle-primary'),
  'lifecycle cron has exact bounded invocation'
);
select pg_temp.ok(
  position('crm_lifecycle_scheduler_url' in pg_get_functiondef('crm_security.invoke_crm_lifecycle_scheduler()'::regprocedure)) > 0
  and position('crm_lifecycle_scheduler_token' in pg_get_functiondef('crm_security.invoke_crm_lifecycle_scheduler()'::regprocedure)) > 0
  and position('/api/cron/crm-lifecycle' in pg_get_functiondef('crm_security.invoke_crm_lifecycle_scheduler()'::regprocedure)) > 0
  and position('crm_intake_scheduler_' in pg_get_functiondef('crm_security.invoke_crm_lifecycle_scheduler()'::regprocedure)) = 0,
  'scheduler URL/token/path are lifecycle-specific'
);
select pg_temp.ok(
  not has_function_privilege('service_role', 'crm_security.invoke_crm_lifecycle_scheduler()', 'execute'),
  'database scheduler invoker remains private'
);

select pg_temp.ok(
  (select count(*) = 7 and bool_and(c.relrowsecurity)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (
      'crm_lifecycle_provider_contracts','crm_lifecycle_activation_epochs',
      'crm_lifecycle_eligibility_policies','crm_lifecycle_eligibility_checks',
      'crm_lifecycle_eligibility_evidence','crm_lifecycle_retry_audit',
      'crm_lifecycle_scheduler_health')),
  'all Batch 2 tables have RLS enabled'
);
select pg_temp.ok(
  not has_table_privilege('service_role','crm_lifecycle_provider_contracts','select')
  and not has_table_privilege('authenticated','crm_lifecycle_eligibility_evidence','select')
  and not has_table_privilege('anon','crm_lifecycle_scheduler_health','select'),
  'new tables expose no direct client or worker access'
);
select pg_temp.ok(
  not has_function_privilege('authenticated','crm_claim_external_deliveries(integer,boolean)','execute')
  and has_function_privilege('service_role','crm_claim_external_deliveries(integer,boolean)','execute')
  and not has_function_privilege('authenticated','crm_activate_lifecycle_destination(uuid,bigint,uuid)','execute')
  and has_function_privilege('service_role','crm_activate_lifecycle_destination(uuid,bigint,uuid)','execute'),
  'live claim and activation remain worker/operator only'
);
select pg_temp.ok(
  has_function_privilege('authenticated','crm_lifecycle_diagnostics()','execute')
  and not has_function_privilege('anon','crm_lifecycle_diagnostics()','execute'),
  'diagnostics enter through stored-role authorization only'
);

select pg_temp.ok(
  (select count(*) = 7 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and c.relname in (
      'crm_lifecycle_provider_contracts','crm_lifecycle_activation_epochs',
      'crm_lifecycle_eligibility_policies','crm_lifecycle_eligibility_checks',
      'crm_lifecycle_eligibility_evidence','crm_lifecycle_retry_audit',
      'crm_external_deliveries') and (t.tgtype & 32) = 32),
  'provider, policy, evidence, retry, epoch and delivery history reject truncate'
);

insert into auth.users(id,email,aud,role)
values('8b000000-0000-0000-0000-000000000001','batch2-director@example.invalid','authenticated','authenticated');
update public.profiles set role='director' where id='8b000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','8b000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

create temp table fixture_connection as
select (public.crm_save_meta_connection('{"connection_key":"batch2-contract-gate","page_id":"990001","api_version":"v99.0"}'::jsonb)->>'id')::uuid id;

select pg_temp.denied(
  format(
    'select public.crm_configure_lifecycle(%L,1,%L::jsonb)',
    (select id from fixture_connection),
    jsonb_build_object('mode','live','enabled',false,'dataset_id','990002',
      'secret_ref','CRM_META_LIFECYCLE_TOKEN_BATCH2',
      'contract_id','8b000000-0000-0000-0000-000000000099','max_attempts',3)::text
  ),
  '22023'
);
select pg_temp.ok(
  (select lifecycle_settings = '{}'::jsonb from public.crm_integration_connections
    where id=(select id from fixture_connection)),
  'unverified provider contract cannot configure live mode'
);

select pg_temp.denied(
  $$insert into public.crm_lifecycle_provider_contracts(
      contract_key,revision,api_version,qualified_event_name,converted_event_name,
      action_source,maximum_event_age_seconds,deduplication_window_seconds,
      accepted_response_field,lead_id_only,required_constants,evidence_urls,verified_on,approved_at)
    values('invalid_broad',1,'v99.0','Qualified','Converted','system_generated',86400,86400,
      'events_received',false,'{}','["https://developers.facebook.com/"]',current_date,clock_timestamp())$$,
  '23514'
);

select pg_temp.ok(
  (select bool_and(coalesce(array_to_string(p.proconfig,','),'') like '%search_path=pg_catalog, pg_temp%')
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','crm_security')
      and p.proname in ('crm_configure_lifecycle','crm_activate_lifecycle_destination',
        'crm_claim_external_deliveries','crm_lifecycle_diagnostics',
        'invoke_crm_lifecycle_scheduler')),
  'Batch 2 privileged functions pin search_path'
);

rollback;
\echo 'PASS CRM Batch 2 fail-closed contract, inactive scheduler, RLS/ACL and history boundaries'

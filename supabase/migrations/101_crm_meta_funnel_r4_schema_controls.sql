-- CRM Meta funnel revision 4: dormant five-event schema, occurrence identity,
-- provider-boundary manifest and immutable per-opportunity producer ownership.
-- No provider contract, form policy, boundary, ownership, epoch or activation is
-- seeded by this migration.
begin;

create table public.crm_lifecycle_producer_boundaries (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.crm_integration_connections(id),
  form_mapping_id uuid not null references public.crm_form_mappings(id),
  form_key text not null check(form_key ~ '^[0-9]{1,32}$' and form_key <> '1086266294126723'),
  page_id text not null check(page_id ~ '^[0-9]{1,32}$'),
  dataset_id text not null check(dataset_id ~ '^[0-9]{1,32}$'),
  provider_contract_id uuid not null references public.crm_lifecycle_provider_contracts(id),
  eligibility_policy_id uuid not null references public.crm_lifecycle_eligibility_policies(id),
  policy_version integer not null check(policy_version > 0),
  notice_version text not null check(length(btrim(notice_version)) between 1 and 100),
  notice_text_digest text not null check(notice_text_digest ~ '^[a-f0-9]{64}$'),
  lifecycle_model text not null check(lifecycle_model = 'r4_stage_entry'),
  permitted_producer text not null check(permitted_producer = 'eh_native'),
  valid_from timestamptz not null check(isfinite(valid_from)),
  valid_until timestamptz not null check(isfinite(valid_until) and valid_until > valid_from),
  legacy_exclusion_verified boolean not null check(legacy_exclusion_verified),
  legacy_exclusion_reference text not null check(length(btrim(legacy_exclusion_reference)) between 8 and 200),
  legacy_exclusion_verified_at timestamptz not null check(isfinite(legacy_exclusion_verified_at)),
  legacy_exclusion_valid_until timestamptz not null check(isfinite(legacy_exclusion_valid_until)),
  verified_by text not null check(length(btrim(verified_by)) between 3 and 100),
  revoked_at timestamptz,
  revocation_reason text check(revocation_reason in ('legacy_drift','form_retired','incident','operator_revoked')),
  created_at timestamptz not null default clock_timestamp(),
  check(legacy_exclusion_verified_at <= valid_from),
  check(legacy_exclusion_valid_until >= valid_from),
  check((revoked_at is null) = (revocation_reason is null)),
  unique(id, connection_id),
  unique(id, form_mapping_id)
);

alter table public.crm_lifecycle_producer_boundaries
  add constraint crm_lifecycle_boundary_no_overlap exclude using gist (
    connection_id with =,
    form_mapping_id with =,
    (tstzrange(valid_from, least(valid_until, legacy_exclusion_valid_until, coalesce(revoked_at, valid_until)), '[)')) with &&
  );

-- This deliberately is the narrow marker proven sufficient by the revision-4
-- invariants: the canonical opportunity already freezes first_submission_id and
-- attribution. Repeating raw provider/form identifiers here would enlarge the
-- retained matching surface without strengthening exclusive producer ownership.
create table public.crm_lifecycle_producer_ownership (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id),
  connection_id uuid not null references public.crm_integration_connections(id),
  boundary_id uuid not null references public.crm_lifecycle_producer_boundaries(id),
  activation_epoch_id uuid not null references public.crm_lifecycle_activation_epochs(id),
  producer text not null check(producer in ('eh_native','legacy')),
  assigned_at timestamptz not null default clock_timestamp(),
  unique(lead_id, connection_id),
  unique(lead_id, boundary_id),
  foreign key(boundary_id, connection_id)
    references public.crm_lifecycle_producer_boundaries(id, connection_id)
);

alter table public.crm_lifecycle_producer_boundaries enable row level security;
alter table public.crm_lifecycle_producer_ownership enable row level security;
revoke all on public.crm_lifecycle_producer_boundaries,
  public.crm_lifecycle_producer_ownership from public, anon, authenticated, service_role;

create function crm_security.protect_lifecycle_boundary() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
  if tg_op='DELETE'
    or old.revoked_at is not null
    or new.revoked_at is null
    or (to_jsonb(new)-array['revoked_at','revocation_reason'])
       is distinct from (to_jsonb(old)-array['revoked_at','revocation_reason']) then
    raise exception 'Lifecycle producer boundary is immutable' using errcode='42501';
  end if;
  -- The database, not the caller, records the real append-only revocation time.
  new.revoked_at:=clock_timestamp();
  return new;
end $$;

create trigger crm_lifecycle_boundary_immutable
before update or delete on public.crm_lifecycle_producer_boundaries
for each row execute function crm_security.protect_lifecycle_boundary();
create trigger crm_lifecycle_boundary_no_truncate
before truncate on public.crm_lifecycle_producer_boundaries
for each statement execute function crm_security.reject_history_mutation();
create trigger crm_lifecycle_ownership_immutable
before update or delete on public.crm_lifecycle_producer_ownership
for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_lifecycle_ownership_no_truncate
before truncate on public.crm_lifecycle_producer_ownership
for each statement execute function crm_security.reject_history_mutation();

alter table public.crm_lifecycle_provider_contracts
  alter column deduplication_window_seconds drop not null,
  add column lifecycle_model text not null default 'legacy_first_attainment'
    check(lifecycle_model in ('legacy_first_attainment','r4_stage_entry')),
  add column event_map jsonb not null default '{}',
  add column uncertainty_policy text not null default 'legacy_bounded_dedup'
    check(uncertainty_policy in ('legacy_bounded_dedup','no_uncertain_replay'));

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid='public.crm_lifecycle_provider_contracts'::regclass
      and contype='c'
      and (pg_get_constraintdef(oid) like '%deduplication_window_seconds%'
        or pg_get_constraintdef(oid) like '%required_constants%')
  loop
    execute format('alter table public.crm_lifecycle_provider_contracts drop constraint %I', constraint_name);
  end loop;
end $$;
alter table public.crm_lifecycle_provider_contracts
  add constraint crm_lifecycle_contract_uncertainty check(
    (lifecycle_model='legacy_first_attainment'
      and uncertainty_policy='legacy_bounded_dedup'
      and deduplication_window_seconds between 300 and 7776000
      and event_map='{}'::jsonb)
    or
    (lifecycle_model='r4_stage_entry'
      and uncertainty_policy='no_uncertain_replay'
      and deduplication_window_seconds is null
      and action_source='system_generated'
      and maximum_event_age_seconds between 1 and 604800
      and event_map='{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb
      and event_map->>'qualified'=qualified_event_name
      and event_map->>'converted'=converted_event_name)
  ),
  add constraint crm_lifecycle_contract_constants check(
    (lifecycle_model='legacy_first_attainment' and required_constants='{}'::jsonb)
    or (lifecycle_model='r4_stage_entry'
      and required_constants='{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb)
  );

alter table public.crm_lifecycle_eligibility_policies
  add column lifecycle_model text not null default 'legacy_first_attainment'
    check(lifecycle_model in ('legacy_first_attainment','r4_stage_entry')),
  add column allowed_event_kinds jsonb not null default '["qualified","converted"]';
alter table public.crm_lifecycle_eligibility_policies
  add constraint crm_lifecycle_policy_scope check(
    (lifecycle_model='legacy_first_attainment' and allowed_event_kinds='["qualified","converted"]'::jsonb)
    or
    (lifecycle_model='r4_stage_entry'
      and allowed_event_kinds='["intake","not_qualified","lost","qualified","converted"]'::jsonb)
  );

do $$
declare constraint_name text;
begin
  select conname into constraint_name from pg_constraint
   where conrelid='public.crm_external_deliveries'::regclass
     and contype='c' and pg_get_constraintdef(oid) like '%event_kind%';
  if constraint_name is not null then
    execute format('alter table public.crm_external_deliveries drop constraint %I', constraint_name);
  end if;
  select conname into constraint_name from pg_constraint
   where conrelid='public.crm_external_deliveries'::regclass
     and contype='u' and pg_get_constraintdef(oid)='UNIQUE (lead_id, event_kind)';
  if constraint_name is not null then
    execute format('alter table public.crm_external_deliveries drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.crm_lifecycle_activation_epochs
  add constraint crm_lifecycle_epoch_id_connection_unique unique(id,connection_id);
alter table public.crm_lifecycle_producer_ownership
  add constraint crm_lifecycle_ownership_epoch_route foreign key(activation_epoch_id,connection_id)
    references public.crm_lifecycle_activation_epochs(id,connection_id);

alter table public.crm_external_deliveries
  add constraint crm_delivery_event_kind_r4 check(event_kind in ('intake','not_qualified','lost','qualified','converted')),
  add column lifecycle_model text not null default 'legacy_first_attainment'
    check(lifecycle_model in ('legacy_first_attainment','r4_stage_entry')),
  add column producer_ownership_id uuid references public.crm_lifecycle_producer_ownership(id),
  add column attempt_boundary_state text not null default 'not_started'
    check(attempt_boundary_state in ('not_started','started','confirmed','unknown')),
  add column attempt_boundary_at timestamptz,
  add constraint crm_delivery_attempt_boundary check(
    (attempt_boundary_state='not_started' and attempt_boundary_at is null)
    or (attempt_boundary_state<>'not_started' and attempt_boundary_at is not null)
  ),
  add constraint crm_delivery_r4_owner check(
    lifecycle_model<>'r4_stage_entry' or delivery_mode<>'live' or producer_ownership_id is not null
  );

create unique index crm_delivery_legacy_lead_kind
  on public.crm_external_deliveries(lead_id,event_kind)
  where lifecycle_model='legacy_first_attainment';
create unique index crm_delivery_r4_singleton_kind
  on public.crm_external_deliveries(lead_id,event_kind)
  where lifecycle_model='r4_stage_entry' and event_kind in ('intake','converted');
create index crm_delivery_r4_chronology
  on public.crm_external_deliveries(lead_id,event_time,created_at,id);
create index crm_lifecycle_boundary_current
  on public.crm_lifecycle_producer_boundaries(connection_id,form_mapping_id,valid_from,valid_until)
  where revoked_at is null;
create index crm_lifecycle_ownership_route
  on public.crm_lifecycle_producer_ownership(lead_id,connection_id,producer);

revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;

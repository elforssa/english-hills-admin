-- CRM Batch 2: prospective Meta lifecycle evidence, delivery hardening and retention.
-- No provider contract is seeded here: official Meta documentation remained HTTP 429
-- on 2026-09-29. Live activation therefore remains fail-closed until a reviewed
-- forward migration records the verified contract.
begin;

create table public.crm_lifecycle_provider_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_key text not null unique check(contract_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
  revision integer not null check(revision > 0),
  api_version text not null check(api_version ~ '^v[0-9]{1,3}\.0$'),
  qualified_event_name text not null check(qualified_event_name ~ '^[A-Za-z][A-Za-z0-9_ ]{0,63}$'),
  converted_event_name text not null check(converted_event_name ~ '^[A-Za-z][A-Za-z0-9_ ]{0,63}$'),
  action_source text not null check(action_source in ('system_generated','phone_call','physical_store','other')),
  maximum_event_age_seconds integer not null check(maximum_event_age_seconds between 300 and 7776000),
  deduplication_window_seconds integer not null check(deduplication_window_seconds between 300 and 7776000),
  accepted_response_field text not null check(accepted_response_field ~ '^[a-z][a-z0-9_]{0,63}$'),
  accepted_response_count integer not null default 1 check(accepted_response_count = 1),
  lead_id_only boolean not null check(lead_id_only),
  required_constants jsonb not null default '{}' check(required_constants = '{}'::jsonb),
  evidence_urls jsonb not null check(jsonb_typeof(evidence_urls) = 'array' and jsonb_array_length(evidence_urls) between 1 and 10),
  verified_on date not null,
  approved_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  unique(contract_key, revision)
);

create table public.crm_lifecycle_activation_epochs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.crm_integration_connections(id),
  provider_contract_id uuid not null references public.crm_lifecycle_provider_contracts(id),
  started_at timestamptz not null check(isfinite(started_at)),
  ended_at timestamptz,
  activated_by text not null check(activated_by = 'release_operator'),
  ended_by uuid references public.profiles(id),
  end_reason text check(end_reason in ('director_disabled','operator_disabled','contract_retired','incident')),
  created_at timestamptz not null default clock_timestamp(),
  check(ended_at is null or ended_at > started_at)
);
create unique index crm_lifecycle_one_open_epoch on public.crm_lifecycle_activation_epochs(connection_id) where ended_at is null;

create table public.crm_lifecycle_eligibility_policies (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.crm_integration_connections(id),
  form_mapping_id uuid not null references public.crm_form_mappings(id),
  version integer not null check(version > 0),
  notice_version text not null check(length(btrim(notice_version)) between 1 and 100),
  notice_text_digest text not null check(notice_text_digest ~ '^[a-f0-9]{64}$'),
  adult_field_key text not null check(length(btrim(adult_field_key)) between 1 and 100),
  adult_accepted_values jsonb not null,
  sharing_field_key text not null check(length(btrim(sharing_field_key)) between 1 and 100),
  sharing_accepted_values jsonb not null,
  notice_field_key text check(length(btrim(notice_field_key)) between 1 and 100),
  notice_accepted_values jsonb,
  effective_from timestamptz not null check(isfinite(effective_from)),
  effective_until timestamptz not null check(isfinite(effective_until)),
  retired_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(connection_id, form_mapping_id, version),
  check(adult_field_key <> sharing_field_key),
  check(notice_field_key is null or notice_field_key not in (adult_field_key, sharing_field_key)),
  check((notice_field_key is null) = (notice_accepted_values is null)),
  check(effective_until > effective_from),
  check(retired_at is null or retired_at > effective_from)
);

create table public.crm_lifecycle_eligibility_checks (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.crm_submissions(id),
  policy_id uuid not null references public.crm_lifecycle_eligibility_policies(id),
  checked_at timestamptz not null default clock_timestamp(),
  eligible boolean not null,
  reason_code text not null check(reason_code in ('eligible','adult_missing','adult_ambiguous','sharing_missing','sharing_ambiguous','notice_mismatch','source_mismatch','source_redacted')),
  evidence_digest text check(evidence_digest ~ '^[a-f0-9]{64}$'),
  redacted_at timestamptz,
  unique(submission_id, policy_id),
  check(eligible = (reason_code = 'eligible'))
);

create table public.crm_lifecycle_eligibility_evidence (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.crm_submissions(id),
  connection_id uuid not null references public.crm_integration_connections(id),
  policy_id uuid not null references public.crm_lifecycle_eligibility_policies(id),
  event_type text not null check(event_type in ('grant','revoke')),
  effective_at timestamptz not null check(isfinite(effective_at)),
  recorded_at timestamptz not null default clock_timestamp(),
  source_kind text not null check(source_kind in ('form_response','director_revocation')),
  reason_code text not null check(reason_code in ('explicit_form_evidence','contact_request','policy_withdrawn','source_corrected','privacy_request')),
  source_external_id text check(source_external_id ~ '^[0-9]{1,32}$'),
  source_projection jsonb,
  source_request_key uuid not null,
  actor_id uuid references public.profiles(id),
  supersedes_evidence_id uuid references public.crm_lifecycle_eligibility_evidence(id),
  redacted_at timestamptz,
  unique(connection_id, source_request_key),
  check((event_type = 'grant' and source_kind = 'form_response' and reason_code = 'explicit_form_evidence' and actor_id is null and supersedes_evidence_id is null)
     or (event_type = 'revoke' and source_kind = 'director_revocation' and actor_id is not null and supersedes_evidence_id is not null))
);
create unique index crm_lifecycle_one_grant on public.crm_lifecycle_eligibility_evidence(submission_id, policy_id) where event_type = 'grant';
create unique index crm_lifecycle_one_revocation on public.crm_lifecycle_eligibility_evidence(supersedes_evidence_id) where event_type = 'revoke';

create table public.crm_lifecycle_retry_audit (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.crm_external_deliveries(id),
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default clock_timestamp(),
  reason_code text not null check(reason_code = 'configuration_repaired'),
  prior_status text not null check(prior_status in ('blocked','retry','unknown'))
);

create table public.crm_lifecycle_scheduler_health (
  singleton boolean primary key default true check(singleton),
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text check(last_error_code in ('worker_unavailable','storage_unavailable','deadline_exceeded')),
  last_counts jsonb not null default '{}' check(jsonb_typeof(last_counts) = 'object' and octet_length(last_counts::text) <= 2048)
);
insert into public.crm_lifecycle_scheduler_health(singleton) values(true);

alter table public.crm_lifecycle_provider_contracts enable row level security;
alter table public.crm_lifecycle_activation_epochs enable row level security;
alter table public.crm_lifecycle_eligibility_policies enable row level security;
alter table public.crm_lifecycle_eligibility_checks enable row level security;
alter table public.crm_lifecycle_eligibility_evidence enable row level security;
alter table public.crm_lifecycle_retry_audit enable row level security;
alter table public.crm_lifecycle_scheduler_health enable row level security;
revoke all on public.crm_lifecycle_provider_contracts, public.crm_lifecycle_activation_epochs,
  public.crm_lifecycle_eligibility_policies, public.crm_lifecycle_eligibility_checks,
  public.crm_lifecycle_eligibility_evidence, public.crm_lifecycle_retry_audit,
  public.crm_lifecycle_scheduler_health from public, anon, authenticated, service_role;

alter table public.crm_external_deliveries
  add column delivery_mode text not null default 'mock_legacy' check(delivery_mode in ('mock_legacy','mock','live')),
  add column provider_contract_id uuid references public.crm_lifecycle_provider_contracts(id),
  add column activation_epoch_id uuid references public.crm_lifecycle_activation_epochs(id),
  add column eligibility_evidence_id uuid references public.crm_lifecycle_eligibility_evidence(id),
  add column send_deadline timestamptz,
  add column terminal_at timestamptz,
  add column payload_erased_at timestamptz,
  add constraint crm_delivery_erasure_consistent check(payload_erased_at is null or (payload is null and payload_hash is null)),
  add constraint crm_delivery_live_refs check(delivery_mode <> 'live'
    or (provider_contract_id is not null and activation_epoch_id is not null and eligibility_evidence_id is not null and send_deadline is not null)
    or (status in ('blocked','suppressed') and payload is null and payload_hash is null));
alter table public.crm_external_delivery_attempts
  add column diagnostics_erased_at timestamptz,
  alter column started_at drop not null,
  alter column outcome drop not null,
  drop constraint crm_external_delivery_attempts_check,
  drop constraint crm_external_delivery_attempts_outcome_check,
  add constraint crm_delivery_attempt_state check(
    (diagnostics_erased_at is null and outcome in ('started','sent','retry','blocked','dead','unknown') and ((outcome='started')=(finished_at is null)))
    or (diagnostics_erased_at is not null and outcome is null and started_at is null and finished_at is null)
  );

create index crm_lifecycle_policy_lookup on public.crm_lifecycle_eligibility_policies(connection_id, form_mapping_id, effective_from, effective_until);
create index crm_lifecycle_evidence_active on public.crm_lifecycle_eligibility_evidence(submission_id, connection_id, policy_id, effective_at) where event_type = 'grant';
create index crm_lifecycle_retention on public.crm_external_deliveries(terminal_at, id) where terminal_at is not null and payload_erased_at is null;
create index crm_lifecycle_attempt_retention on public.crm_external_delivery_attempts(finished_at, id) where finished_at is not null and diagnostics_erased_at is null;

create function crm_security.valid_lifecycle_values(values_doc jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select jsonb_typeof(values_doc) = 'array'
    and jsonb_array_length(values_doc) between 1 and 20
    and octet_length(values_doc::text) <= 2048
    and not exists (
      select 1 from jsonb_array_elements(values_doc) v
      where jsonb_typeof(v) not in ('string','boolean','number')
         or (jsonb_typeof(v) = 'string' and length(v #>> '{}') not between 1 and 200)
    )
$$;

alter table public.crm_lifecycle_eligibility_policies
  add constraint crm_lifecycle_adult_values check(crm_security.valid_lifecycle_values(adult_accepted_values)),
  add constraint crm_lifecycle_sharing_values check(crm_security.valid_lifecycle_values(sharing_accepted_values)),
  add constraint crm_lifecycle_notice_values check(notice_accepted_values is null or crm_security.valid_lifecycle_values(notice_accepted_values));

create function crm_security.protect_lifecycle_policy() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'Lifecycle policy history is immutable' using errcode = '42501'; end if;
  if (to_jsonb(new) - 'retired_at') is distinct from (to_jsonb(old) - 'retired_at')
     or old.retired_at is not null or new.retired_at is null or new.retired_at < clock_timestamp() then
    raise exception 'Lifecycle policy history is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger crm_lifecycle_policy_immutable before update or delete on public.crm_lifecycle_eligibility_policies
  for each row execute function crm_security.protect_lifecycle_policy();
create trigger crm_lifecycle_policy_no_truncate before truncate on public.crm_lifecycle_eligibility_policies
  for each statement execute function crm_security.reject_history_mutation();

create function crm_security.protect_lifecycle_append_only() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'Lifecycle audit history is append-only' using errcode = '42501';
end $$;
create trigger crm_lifecycle_evidence_append_only before update or delete on public.crm_lifecycle_eligibility_evidence
  for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_lifecycle_retry_append_only before update or delete on public.crm_lifecycle_retry_audit
  for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_lifecycle_contract_append_only before update or delete on public.crm_lifecycle_provider_contracts
  for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_lifecycle_contract_no_truncate before truncate on public.crm_lifecycle_provider_contracts
  for each statement execute function crm_security.reject_history_mutation();
create trigger crm_lifecycle_evidence_no_truncate before truncate on public.crm_lifecycle_eligibility_evidence
  for each statement execute function crm_security.reject_history_mutation();
create trigger crm_lifecycle_retry_no_truncate before truncate on public.crm_lifecycle_retry_audit
  for each statement execute function crm_security.reject_history_mutation();

create function crm_security.protect_lifecycle_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'DELETE' or old.redacted_at is not null or new.redacted_at is null
     or new.submission_id is not null or new.evidence_digest is not null
     or (to_jsonb(new) - array['submission_id','evidence_digest','redacted_at'])
       is distinct from (to_jsonb(old) - array['submission_id','evidence_digest','redacted_at']) then
    raise exception 'Lifecycle eligibility history is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger crm_lifecycle_check_immutable before update or delete on public.crm_lifecycle_eligibility_checks
  for each row execute function crm_security.protect_lifecycle_check();
create trigger crm_lifecycle_check_no_truncate before truncate on public.crm_lifecycle_eligibility_checks
  for each statement execute function crm_security.reject_history_mutation();

create function crm_security.protect_lifecycle_epoch() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'DELETE' or (to_jsonb(new) - array['ended_at','ended_by','end_reason']) is distinct from (to_jsonb(old) - array['ended_at','ended_by','end_reason'])
     or old.ended_at is not null or new.ended_at is null then
    raise exception 'Lifecycle activation history is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger crm_lifecycle_epoch_immutable before update or delete on public.crm_lifecycle_activation_epochs
  for each row execute function crm_security.protect_lifecycle_epoch();
create trigger crm_lifecycle_epoch_no_truncate before truncate on public.crm_lifecycle_activation_epochs
  for each statement execute function crm_security.reject_history_mutation();

create or replace function crm_security.protect_delivery() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare retention_erasure boolean; terminal_backfill boolean;
begin
  if tg_op = 'DELETE' then raise exception 'Delivery history immutable' using errcode = '42501'; end if;
  terminal_backfill := old.status in ('sent','dead','suppressed') and old.terminal_at is null and new.terminal_at is not null
    and (to_jsonb(new) - array['terminal_at','updated_at']) = (to_jsonb(old) - array['terminal_at','updated_at']);
  if terminal_backfill then return new; end if;
  retention_erasure := old.terminal_at is not null
    and old.terminal_at <= clock_timestamp() - interval '30 days'
    and old.payload_erased_at is null and new.payload_erased_at is not null
    and new.payload is null and new.payload_hash is null and new.matching_submission_id is null
    and (to_jsonb(new) - array['payload','payload_hash','matching_submission_id','payload_erased_at','updated_at'])
      = (to_jsonb(old) - array['payload','payload_hash','matching_submission_id','payload_erased_at','updated_at']);
  if retention_erasure then return new; end if;
  if row(new.activity_id,new.lead_id,new.connection_id,new.event_kind,new.event_time,new.provider_event_id,new.attribution_submission_id,new.matching_submission_id,new.created_at,
         new.delivery_mode,new.provider_contract_id,new.activation_epoch_id,new.eligibility_evidence_id,new.send_deadline)
     is distinct from
     row(old.activity_id,old.lead_id,old.connection_id,old.event_kind,old.event_time,old.provider_event_id,old.attribution_submission_id,old.matching_submission_id,old.created_at,
         old.delivery_mode,old.provider_contract_id,old.activation_epoch_id,old.eligibility_evidence_id,old.send_deadline)
     or (old.payload is not null and row(new.payload,new.payload_hash,new.provider_event_name,new.mapping_version,new.mapping_snapshot,new.max_attempts)
       is distinct from row(old.payload,old.payload_hash,old.provider_event_name,old.mapping_version,old.mapping_snapshot,old.max_attempts))
     or old.status in ('sent','dead','suppressed') then
    raise exception 'Frozen delivery identity/payload' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function crm_security.protect_delivery_attempt() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare diagnostic_erasure boolean;
begin
  if tg_op = 'DELETE' then raise exception 'Final attempt immutable' using errcode = '42501'; end if;
  diagnostic_erasure := old.finished_at is not null
    and old.finished_at <= clock_timestamp() - interval '90 days'
    and old.diagnostics_erased_at is null and new.diagnostics_erased_at is not null
    and new.started_at is null and new.finished_at is null and new.outcome is null
    and new.http_status is null and new.provider_request_id is null and new.response_summary is null and new.error_code is null
    and (to_jsonb(new) - array['started_at','finished_at','outcome','http_status','provider_request_id','response_summary','error_code','diagnostics_erased_at'])
      = (to_jsonb(old) - array['started_at','finished_at','outcome','http_status','provider_request_id','response_summary','error_code','diagnostics_erased_at']);
  if diagnostic_erasure then return new; end if;
  if old.finished_at is not null
     or row(new.id,new.delivery_id,new.attempt_number,new.lease_token,new.started_at) is distinct from row(old.id,old.delivery_id,old.attempt_number,old.lease_token,old.started_at) then
    raise exception 'Final attempt immutable' using errcode = '42501';
  end if;
  return new;
end $$;

update public.crm_external_deliveries
   set terminal_at = coalesce(sent_at, updated_at)
 where status in ('sent','dead','suppressed') and terminal_at is null;

create function public.crm_publish_lifecycle_policy(p_connection uuid, p_connection_version bigint, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare c public.crm_integration_connections; m public.crm_form_mappings; p public.crm_lifecycle_eligibility_policies; next_version integer; effective timestamptz;
begin
  perform crm_security.require_reader(true);
  select * into c from public.crm_integration_connections where id = p_connection and provider = 'meta' for update;
  if not found or c.version is distinct from p_connection_version then raise exception 'Refresh connection' using errcode = '40001'; end if;
  if jsonb_typeof(p_data) is distinct from 'object'
     or p_data - array['form_mapping_id','notice_version','notice_text_digest','adult_field_key','adult_accepted_values','sharing_field_key','sharing_accepted_values','notice_field_key','notice_accepted_values','effective_from','effective_until'] <> '{}'::jsonb then
    raise exception 'Invalid policy fields' using errcode = '22023';
  end if;
  select * into m from public.crm_form_mappings where id = (p_data->>'form_mapping_id')::uuid and connection_id = c.id and channel = 'meta_instant_form';
  if not found then raise exception 'Meta form mapping required' using errcode = '22023'; end if;
  effective := (p_data->>'effective_from')::timestamptz;
  if effective < clock_timestamp() or (p_data->>'effective_until')::timestamptz <= effective then raise exception 'Prospective policy interval required' using errcode = '22023'; end if;
  if coalesce(p_data->>'notice_version','') = '' or coalesce(p_data->>'notice_text_digest','') !~ '^[a-f0-9]{64}$'
     or coalesce(p_data->>'adult_field_key','') = '' or coalesce(p_data->>'sharing_field_key','') = ''
     or not crm_security.valid_lifecycle_values(p_data->'adult_accepted_values')
     or not crm_security.valid_lifecycle_values(p_data->'sharing_accepted_values')
     or ((p_data->>'notice_field_key') is null) <> ((p_data->'notice_accepted_values') is null)
     or (p_data->'notice_accepted_values' is not null and not crm_security.valid_lifecycle_values(p_data->'notice_accepted_values')) then
    raise exception 'Exact evidence manifest required' using errcode = '22023';
  end if;
  select coalesce(max(version),0) + 1 into next_version from public.crm_lifecycle_eligibility_policies where connection_id = c.id and form_mapping_id = m.id;
  insert into public.crm_lifecycle_eligibility_policies(connection_id,form_mapping_id,version,notice_version,notice_text_digest,
    adult_field_key,adult_accepted_values,sharing_field_key,sharing_accepted_values,notice_field_key,notice_accepted_values,effective_from,effective_until,created_by)
  values(c.id,m.id,next_version,p_data->>'notice_version',p_data->>'notice_text_digest',p_data->>'adult_field_key',p_data->'adult_accepted_values',
    p_data->>'sharing_field_key',p_data->'sharing_accepted_values',p_data->>'notice_field_key',p_data->'notice_accepted_values',effective,(p_data->>'effective_until')::timestamptz,auth.uid())
  returning * into p;
  update public.crm_integration_connections set version = version + 1, updated_by = auth.uid(), updated_at = now() where id = c.id;
  return to_jsonb(p) - array['adult_accepted_values','sharing_accepted_values','notice_accepted_values'];
end $$;

create function public.crm_retire_lifecycle_policy(p_policy uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform crm_security.require_reader(true);
  update public.crm_lifecycle_eligibility_policies set retired_at = greatest(clock_timestamp(), effective_from + interval '1 microsecond')
   where id = p_policy and retired_at is null;
  if not found then raise exception 'Active policy required' using errcode = '22023'; end if;
end $$;

create function public.crm_claim_lifecycle_evidence(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare result jsonb;
begin
  perform crm_security.require_meta_worker();
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid evidence batch' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'submission_id',x.submission_id,'policy_id',x.policy_id,'occurred_at',x.occurred_at,
    'adult_field_key',x.adult_field_key,'adult_accepted_values',x.adult_accepted_values,
    'sharing_field_key',x.sharing_field_key,'sharing_accepted_values',x.sharing_accepted_values,
    'notice_field_key',x.notice_field_key,'notice_accepted_values',x.notice_accepted_values,
    'notice_version',x.notice_version,'answers',x.answers
  ) order by x.occurred_at,x.submission_id),'[]'::jsonb) into result
  from (
    select s.id submission_id,p.id policy_id,s.occurred_at,p.adult_field_key,p.adult_accepted_values,
      p.sharing_field_key,p.sharing_accepted_values,p.notice_field_key,p.notice_accepted_values,p.notice_version,
      coalesce((select jsonb_agg(answer order by answer->>'key') from jsonb_array_elements(s.form_answers) answer
        where answer->>'key' in (p.adult_field_key,p.sharing_field_key,coalesce(p.notice_field_key,''))),'[]'::jsonb) answers
    from public.crm_submissions s
    join public.crm_submission_attribution a on a.submission_id = s.id
    join public.crm_form_mappings m on m.id = s.form_mapping_id
    join public.crm_lifecycle_eligibility_policies p on p.form_mapping_id = m.id and p.connection_id = m.connection_id
      and s.occurred_at >= p.effective_from and s.occurred_at < p.effective_until
      and (p.retired_at is null or s.occurred_at < p.retired_at)
    where s.channel = 'meta_instant_form' and s.match_status = 'resolved' and a.provider = 'meta' and a.redacted_at is null
      and a.page_id = (select c.page_id from public.crm_integration_connections c where c.id = p.connection_id)
      and a.form_id = m.form_key and a.external_submission_id ~ '^[0-9]{1,32}$'
      and not exists(select 1 from public.crm_lifecycle_eligibility_checks e where e.submission_id = s.id and e.policy_id = p.id)
    order by s.occurred_at,s.id limit p_limit
  ) x;
  return result;
end $$;

create function public.crm_record_lifecycle_evidence_check(p_submission uuid,p_policy uuid,p_eligible boolean,p_reason text,p_digest text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare s public.crm_submissions;a public.crm_submission_attribution;p public.crm_lifecycle_eligibility_policies;m public.crm_form_mappings;check_id uuid;evidence_id uuid;projection jsonb;
begin
  perform crm_security.require_meta_worker();
  if p_reason not in ('eligible','adult_missing','adult_ambiguous','sharing_missing','sharing_ambiguous','notice_mismatch','source_mismatch','source_redacted')
     or p_eligible is distinct from (p_reason = 'eligible') or p_digest !~ '^[a-f0-9]{64}$' then raise exception 'Invalid evidence result' using errcode = '22023'; end if;
  select * into s from public.crm_submissions where id = p_submission for share;
  select * into a from public.crm_submission_attribution where submission_id = p_submission for share;
  select * into p from public.crm_lifecycle_eligibility_policies where id = p_policy for share;
  select * into m from public.crm_form_mappings where id = p.form_mapping_id;
  if s.id is null or p.id is null or m.id is null or s.form_mapping_id is distinct from m.id or m.connection_id is distinct from p.connection_id
     or s.channel <> 'meta_instant_form' or s.occurred_at < p.effective_from or s.occurred_at >= p.effective_until
     or (p.retired_at is not null and s.occurred_at >= p.retired_at) or a.provider <> 'meta' or a.form_id is distinct from m.form_key
     or a.page_id is distinct from (select page_id from public.crm_integration_connections where id = p.connection_id) then
    p_eligible := false; p_reason := 'source_mismatch';
  elsif a.redacted_at is not null then p_eligible := false; p_reason := 'source_redacted'; end if;
  insert into public.crm_lifecycle_eligibility_checks(submission_id,policy_id,eligible,reason_code,evidence_digest)
  values(p_submission,p_policy,p_eligible,p_reason,p_digest) on conflict(submission_id,policy_id) do nothing returning id into check_id;
  if check_id is null then select id into check_id from public.crm_lifecycle_eligibility_checks where submission_id = p_submission and policy_id = p_policy; end if;
  select eligible,reason_code into p_eligible,p_reason from public.crm_lifecycle_eligibility_checks where id=check_id;
  if p_eligible then
    projection := jsonb_build_object('page_id',a.page_id,'form_id',a.form_id,'notice_version',p.notice_version,'captured_at',s.occurred_at);
    insert into public.crm_lifecycle_eligibility_evidence(submission_id,connection_id,policy_id,event_type,effective_at,source_kind,reason_code,
      source_external_id,source_projection,source_request_key)
    values(s.id,p.connection_id,p.id,'grant',s.occurred_at,'form_response','explicit_form_evidence',a.external_submission_id,projection,
      gen_random_uuid())
    on conflict do nothing returning id into evidence_id;
    if evidence_id is null then select id into evidence_id from public.crm_lifecycle_eligibility_evidence where submission_id=s.id and policy_id=p.id and event_type='grant'; end if;
  end if;
  return jsonb_build_object('check_id',check_id,'eligible',p_eligible,'evidence_id',evidence_id);
end $$;

create function public.crm_revoke_lifecycle_evidence(p_request uuid,p_evidence uuid,p_reason text) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare grant_row public.crm_lifecycle_eligibility_evidence; result uuid;
begin
  perform crm_security.require_reader(true);
  if p_request is null or p_reason not in ('contact_request','policy_withdrawn','source_corrected','privacy_request') then raise exception 'Controlled revocation required' using errcode='22023'; end if;
  select * into grant_row from public.crm_lifecycle_eligibility_evidence where id=p_evidence and event_type='grant' for update;
  if not found then raise exception 'Grant required' using errcode='22023'; end if;
  insert into public.crm_lifecycle_eligibility_evidence(submission_id,connection_id,policy_id,event_type,effective_at,source_kind,reason_code,source_request_key,actor_id,supersedes_evidence_id)
  values(grant_row.submission_id,grant_row.connection_id,grant_row.policy_id,'revoke',clock_timestamp(),'director_revocation',p_reason,p_request,auth.uid(),grant_row.id)
  on conflict(connection_id,source_request_key) do nothing returning id into result;
  if result is null then select id into result from public.crm_lifecycle_eligibility_evidence where connection_id=grant_row.connection_id and source_request_key=p_request; end if;
  return result;
end $$;

revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
revoke all on function public.crm_publish_lifecycle_policy(uuid,bigint,jsonb),public.crm_retire_lifecycle_policy(uuid),
  public.crm_claim_lifecycle_evidence(integer),public.crm_record_lifecycle_evidence_check(uuid,uuid,boolean,text,text),
  public.crm_revoke_lifecycle_evidence(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.crm_publish_lifecycle_policy(uuid,bigint,jsonb),public.crm_retire_lifecycle_policy(uuid),
  public.crm_revoke_lifecycle_evidence(uuid,uuid,text) to authenticated;
grant execute on function public.crm_claim_lifecycle_evidence(integer),public.crm_record_lifecycle_evidence_check(uuid,uuid,boolean,text,text) to service_role;

notify pgrst,'reload schema';
commit;

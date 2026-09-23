-- CRM Phase 2: structure only. Lifecycle statuses are stored UPPERCASE;
-- operational kinds/reasons are lowercase. No policy hours or real CRM rows seeded.
begin;
create schema crm_security;
revoke all on schema crm_security from public,anon,authenticated,service_role;

-- Form answers use JSON-native value_type names (string, number, boolean,
-- array, object, null). label_source is a nonempty provenance label.
create function crm_security.valid_answers(answers jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare a jsonb;
begin
  if jsonb_typeof(answers) is distinct from 'array' then return false; end if;
  for a in select value from jsonb_array_elements(answers) loop
    if jsonb_typeof(a) is distinct from 'object'
      or not (a ?& array['key','label','value','value_type','label_source'])
      or (a - array['key','label','value','value_type','label_source']) <> '{}'::jsonb
      or jsonb_typeof(a->'key') is distinct from 'string' or length(btrim(a->>'key'))=0
      or jsonb_typeof(a->'label') is distinct from 'string'
      or jsonb_typeof(a->'label_source') is distinct from 'string' or length(btrim(a->>'label_source'))=0
      or jsonb_typeof(a->'value_type') is distinct from 'string'
      or (a->>'value_type') is distinct from jsonb_typeof(a->'value') then return false; end if;
  end loop;
  return true;
end $$;

-- Reject technical attribution keys, including nested objects/arrays. Read
-- interfaces additionally omit details entirely; this is defense in depth.
create function crm_security.safe_details(doc jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare item record; child jsonb;
begin
  if jsonb_typeof(doc)='object' then
    for item in select key,value from jsonb_each(doc) loop
      if regexp_replace(lower(item.key),'[^a-z0-9]','','g') = any(array[
        'campaignid','adsetid','adid','accountid','pageid','formid','metaleadid','leadgenid',
        'externalsubmissionid','rawpayload','technicalattribution','attribution','fbclid','fbc','fbp'])
        or not crm_security.safe_details(item.value) then return false; end if;
    end loop;
  elsif jsonb_typeof(doc)='array' then
    for child in select value from jsonb_array_elements(doc) loop
      if not crm_security.safe_details(child) then return false; end if;
    end loop;
  end if;
  return true;
end $$;

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  display_name text,
  contact_kind text not null check(contact_kind in ('guardian','adult_learner','other','unknown')),
  phone_raw text, phone_e164 text check(phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  whatsapp_raw text, whatsapp_e164 text check(whatsapp_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  email_raw text, email_normalized text check(email_normalized=lower(btrim(email_normalized)) and length(email_normalized)>0),
  preferred_channel text check(preferred_channel in ('phone','whatsapp','email','in_person')),
  created_by uuid references public.profiles(id) on delete restrict,
  merged_into_contact_id uuid references public.crm_contacts(id) on delete restrict,
  version bigint not null default 1 check(version>0),
  check(merged_into_contact_id is distinct from id)
);
alter table public.crm_contacts enable row level security;
revoke all on table public.crm_contacts from public,anon,authenticated,service_role;

create table public.crm_followup_policies (
  id uuid primary key default gen_random_uuid(), version integer not null unique check(version>0),
  timezone text not null default 'Africa/Casablanca' check(timezone='Africa/Casablanca'),
  weekly_hours jsonb not null check(jsonb_typeof(weekly_hours)='object'),
  date_exceptions jsonb not null check(jsonb_typeof(date_exceptions)='array'),
  attempt_offsets integer[] not null default array[0,0,1,3,5]
    check(cardinality(attempt_offsets)>0 and array_ndims(attempt_offsets)=1
      and array_position(attempt_offsets,null) is null and 0<=all(attempt_offsets)),
  minimum_attempt_gap_minutes integer not null default 180 check(minimum_attempt_gap_minutes>0),
  first_contact_sla_minutes integer not null default 15 check(first_contact_sla_minutes>0),
  post_test_sla_minutes integer not null default 120 check(post_test_sla_minutes>0),
  stale_contacting_minutes integer not null check(stale_contacting_minutes>0),
  effective_from timestamptz not null, retired_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
  check(retired_at is null or retired_at>effective_from)
);
alter table public.crm_followup_policies enable row level security;
revoke all on table public.crm_followup_policies from public,anon,authenticated,service_role;

create table public.crm_submissions (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  lead_id uuid,
  channel text not null check(channel in ('manual','meta_instant_form','website')),
  received_at timestamptz not null, occurred_at timestamptz not null,
  time_source text not null check(time_source in ('provider','client','server')),
  core_fields jsonb not null check(jsonb_typeof(core_fields)='object'),
  form_answers jsonb not null check(crm_security.valid_answers(form_answers)),
  source_label text not null check(length(btrim(source_label))>0),
  match_status text not null check(match_status in ('resolved','needs_review','rejected')),
  candidate_lead_ids uuid[] not null default '{}' check(cardinality(candidate_lead_ids)<=50 and array_position(candidate_lead_ids,null) is null),
  resolved_by uuid references public.profiles(id) on delete restrict, resolved_at timestamptz,
  request_key uuid unique,
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  unique(id,lead_id),
  check((match_status='resolved' and lead_id is not null and resolved_at is not null)
    or (match_status in ('needs_review','rejected') and lead_id is null and resolved_at is null and resolved_by is null))
);
alter table public.crm_submissions enable row level security;
revoke all on table public.crm_submissions from public,anon,authenticated,service_role;

create table public.crm_submission_attribution (
  submission_id uuid primary key references public.crm_submissions(id) on delete restrict,
  provider text not null check(provider in ('meta','website','manual')),
  external_submission_id text, external_scope text,
  account_id text, page_id text, form_id text, form_name_snapshot text,
  campaign_id text, campaign_name_snapshot text, adset_id text, adset_name_snapshot text,
  ad_id text, ad_name_snapshot text, platform text, provider_created_at timestamptz,
  landing_page text, referrer text, utm_source text, utm_medium text, utm_campaign text,
  utm_content text, utm_term text, fbclid text, fbc text, fbp text,
  raw_payload jsonb, consent_evidence jsonb,
  attribution_status text not null check(attribution_status in ('complete','partial','unavailable')),
  captured_at timestamptz not null default now(), retention_until timestamptz, redacted_at timestamptz,
  check(external_submission_id is null or (length(btrim(external_submission_id))>0
    and external_scope is not null and length(btrim(external_scope))>0))
);
alter table public.crm_submission_attribution enable row level security;
revoke all on table public.crm_submission_attribution from public,anon,authenticated,service_role;

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  learner_name text, learner_name_normalized text check(learner_name_normalized=lower(btrim(learner_name_normalized))),
  learner_birth_date date, learner_age integer check(learner_age between 0 and 120), age_recorded_at timestamptz,
  session_type text check(session_type in ('Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other')),
  program_interest_text text,
  status text not null default 'NEW' check(status in ('NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED','LOST','NOT_QUALIFIED')),
  owner_id uuid references public.profiles(id) on delete restrict,
  qualification_step text check(qualification_step in ('placement_test','center_visit','enrollment','other')),
  closure_reason text, closure_note text, closed_at timestamptz,
  first_submission_id uuid not null, latest_submission_id uuid not null,
  student_id uuid references public.students(id) on delete restrict,
  enrollment_id uuid unique references public.enrollments(id) on delete restrict,
  converted_at timestamptz, conversion_activity_id uuid,
  conversion_review_required boolean not null default false,
  outreach_cycle integer not null default 1 check(outreach_cycle>0), outreach_anchor_date date,
  followup_policy_id uuid not null references public.crm_followup_policies(id) on delete restrict,
  last_attempt_at timestamptz, last_conversation_at timestamptz,
  strict_match_key text check(length(btrim(strict_match_key))>0),
  merged_into_lead_id uuid references public.crm_leads(id) on delete restrict,
  version bigint not null default 1 check(version>0),
  check(merged_into_lead_id is distinct from id),
  check((learner_age is null)=(age_recorded_at is null)),
  check(enrollment_id is null or student_id is not null),
  constraint crm_leads_closure check(
    (status='LOST' and closed_at is not null and closure_reason is not null
      and closure_reason in ('unreachable','not_interested','price','schedule','location','chose_competitor','postponed','other')
      and (closure_reason<>'other' or coalesce(length(btrim(closure_note)),0)>0))
    or (status='NOT_QUALIFIED' and closed_at is not null and closure_reason is not null
      and closure_reason in ('age_not_suitable','program_not_suitable','invalid_spam','duplicate','outside_scope','other')
      and (closure_reason<>'other' or coalesce(length(btrim(closure_note)),0)>0))
    or (status not in ('LOST','NOT_QUALIFIED') and closure_reason is null and closure_note is null and closed_at is null)),
  constraint crm_leads_conversion check(
    (status='CONVERTED' and enrollment_id is not null and student_id is not null
      and conversion_activity_id is not null and converted_at is not null)
    or (status<>'CONVERTED' and enrollment_id is null and conversion_activity_id is null and converted_at is null))
);
alter table public.crm_leads enable row level security;
revoke all on table public.crm_leads from public,anon,authenticated,service_role;

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  lead_id uuid not null references public.crm_leads(id) on delete restrict deferrable initially deferred,
  occurred_at timestamptz not null,
  actor_id uuid references public.profiles(id) on delete restrict, actor_kind text not null check(actor_kind in ('user','system','integration')),
  event_type text not null check(event_type ~ '^[a-z][a-z0-9_]*$'),
  channel text check(channel in ('phone','whatsapp','email','in_person','system')), outcome text,
  from_status text check(from_status in ('NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED','LOST','NOT_QUALIFIED')),
  to_status text check(to_status in ('NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED','LOST','NOT_QUALIFIED')),
  body text, details jsonb not null default '{}' check(jsonb_typeof(details)='object' and crm_security.safe_details(details)),
  task_id uuid, submission_id uuid references public.crm_submissions(id) on delete restrict,
  placement_test_id uuid references public.placement_tests(id) on delete restrict,
  enrollment_id uuid references public.enrollments(id) on delete restrict,
  receipt_id uuid references public.receipts(id) on delete restrict,
  financial_event_id uuid references public.financial_events(id) on delete restrict,
  attribution_submission_id uuid references public.crm_submissions(id) on delete restrict,
  source_key text not null unique check(length(btrim(source_key))>0),
  outreach_cycle integer, attempt_ordinal smallint,
  supersedes_activity_id uuid references public.crm_activities(id) on delete restrict,
  unique(id,lead_id), unique(id,lead_id,enrollment_id),
  check(actor_kind<>'user' or actor_id is not null),
  check((outreach_cycle is null and attempt_ordinal is null)
    or (outreach_cycle is not null and outreach_cycle>0 and attempt_ordinal is not null and attempt_ordinal>0)),
  check(supersedes_activity_id is distinct from id)
);
alter table public.crm_activities enable row level security;
revoke all on table public.crm_activities from public,anon,authenticated,service_role;

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  lead_id uuid not null references public.crm_leads(id) on delete restrict deferrable initially deferred,
  task_type text not null check(task_type in ('first_contact','contact_attempt','callback','whatsapp_followup','confirm_placement_test','post_test_followup','center_visit','enrollment_followup')),
  status text not null default 'open' check(status in ('open','completed','cancelled')),
  assigned_to uuid references public.profiles(id) on delete restrict, due_at timestamptz not null, scheduled_end_at timestamptz,
  timezone text not null default 'Africa/Casablanca' check(timezone='Africa/Casablanca'),
  priority smallint not null default 2 check(priority between 1 and 3),
  instructions text,
  source_kind text not null check(source_kind in ('manual','intake','attempt_sequence','placement_result','enrollment')),
  source_key text not null unique check(length(btrim(source_key))>0),
  source_activity_id uuid, placement_test_id uuid references public.placement_tests(id) on delete restrict,
  outreach_cycle integer, attempt_ordinal smallint,
  policy_id uuid references public.crm_followup_policies(id) on delete restrict,
  completed_at timestamptz, cancelled_at timestamptz,
  completed_by uuid references public.profiles(id) on delete restrict, cancelled_by uuid references public.profiles(id) on delete restrict,
  completion_activity_id uuid, cancellation_reason text,
  supersedes_task_id uuid references public.crm_tasks(id) on delete restrict,
  version bigint not null default 1 check(version>0), unique(id,lead_id),
  check(supersedes_task_id is distinct from id),
  check(scheduled_end_at is null or scheduled_end_at>due_at),
  check((outreach_cycle is null and attempt_ordinal is null)
    or (outreach_cycle is not null and outreach_cycle>0 and attempt_ordinal is not null and attempt_ordinal>0)),
  check(source_kind<>'attempt_sequence' or (outreach_cycle is not null and attempt_ordinal is not null and policy_id is not null)),
  constraint crm_tasks_terminal check(
    (status='open' and completed_at is null and cancelled_at is null and completed_by is null
      and cancelled_by is null and completion_activity_id is null and cancellation_reason is null)
    or (status='completed' and completed_at is not null and cancelled_at is null and cancelled_by is null
      and cancellation_reason is null and completion_activity_id is not null)
    or (status='cancelled' and cancelled_at is not null and completed_at is null and completed_by is null
      and completion_activity_id is null and coalesce(length(btrim(cancellation_reason)),0)>0))
);
alter table public.crm_tasks enable row level security;
revoke all on table public.crm_tasks from public,anon,authenticated,service_role;

create table public.crm_command_requests (
  id uuid primary key default gen_random_uuid(),
  actor_scope text not null check(length(btrim(actor_scope))>0),
  command_name text not null check(length(btrim(command_name))>0), request_key uuid not null,
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null, created_at timestamptz not null default now(),
  unique(actor_scope,command_name,request_key)
);
alter table public.crm_command_requests enable row level security;
revoke all on table public.crm_command_requests from public,anon,authenticated,service_role;

-- Deferred ownership FKs permit one atomic future intake/conversion command:
-- preallocate UUIDs, insert lead + submission/activity/task, satisfy all at commit.
alter table public.crm_submissions add foreign key(lead_id) references public.crm_leads(id) on delete restrict deferrable initially deferred;
alter table public.crm_leads
  add foreign key(first_submission_id,id) references public.crm_submissions(id,lead_id) on delete restrict deferrable initially deferred,
  add foreign key(latest_submission_id,id) references public.crm_submissions(id,lead_id) on delete restrict deferrable initially deferred,
  add foreign key(conversion_activity_id,id,enrollment_id) references public.crm_activities(id,lead_id,enrollment_id) on delete restrict deferrable initially deferred;
alter table public.crm_activities
  add foreign key(task_id,lead_id) references public.crm_tasks(id,lead_id) on delete restrict deferrable initially deferred,
  add foreign key(submission_id,lead_id) references public.crm_submissions(id,lead_id) on delete restrict deferrable initially deferred,
  add foreign key(attribution_submission_id,lead_id) references public.crm_submissions(id,lead_id) on delete restrict deferrable initially deferred,
  add foreign key(supersedes_activity_id,lead_id) references public.crm_activities(id,lead_id) on delete restrict deferrable initially deferred;
alter table public.crm_tasks
  add foreign key(source_activity_id,lead_id) references public.crm_activities(id,lead_id) on delete restrict deferrable initially deferred,
  add foreign key(completion_activity_id,lead_id) references public.crm_activities(id,lead_id) on delete restrict deferrable initially deferred,
  add foreign key(supersedes_task_id,lead_id) references public.crm_tasks(id,lead_id) on delete restrict deferrable initially deferred;

-- Structural evidence check only: never creates/converts/updates center records.
-- Existing enrollment student identity is immutable under 070–074.
create function crm_security.check_enrollment_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if exists(select 1 from public.crm_leads l where l.id=new.id and l.enrollment_id is not null
    and not exists(select 1 from public.enrollments e where e.id=l.enrollment_id and e.student_id=l.student_id)) then
    raise exception 'CRM enrollment/student mismatch' using errcode='23514';
  end if;
  return null;
end $$;
create constraint trigger crm_enrollment_identity after insert or update on public.crm_leads
  deferrable initially deferred for each row execute function crm_security.check_enrollment_identity();

create function crm_security.reject_history_mutation() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
  raise exception 'CRM history is append-only' using errcode='42501';
end $$;
create trigger crm_activities_immutable before update or delete on public.crm_activities
  for each row execute function crm_security.reject_history_mutation();
create trigger crm_activities_no_truncate before truncate on public.crm_activities
  for each statement execute function crm_security.reject_history_mutation();
create trigger crm_requests_immutable before update or delete on public.crm_command_requests
  for each row execute function crm_security.reject_history_mutation();
create trigger crm_requests_no_truncate before truncate on public.crm_command_requests
  for each statement execute function crm_security.reject_history_mutation();

create function crm_security.protect_submission() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
  if tg_op='DELETE' then raise exception 'Acquisition records cannot be deleted' using errcode='42501'; end if;
  if (to_jsonb(new)-array['lead_id','match_status','candidate_lead_ids','resolved_by','resolved_at','core_fields'])
    is distinct from (to_jsonb(old)-array['lead_id','match_status','candidate_lead_ids','resolved_by','resolved_at','core_fields'])
    or (old.match_status='resolved' and (new.core_fields is distinct from old.core_fields
      or new.lead_id is distinct from old.lead_id or new.match_status is distinct from old.match_status)) then
    raise exception 'Immutable submission acquisition fields' using errcode='42501'; end if;
  return new;
end $$;
create trigger crm_submission_immutable before update or delete on public.crm_submissions
  for each row execute function crm_security.protect_submission();

create function crm_security.protect_attribution() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$ declare field record; begin
  if tg_op='DELETE' then raise exception 'Attribution requires controlled retention' using errcode='42501'; end if;
  -- Redaction is terminal. Even trusted commands cannot restore material or
  -- change the timestamp/identity after this transition (a no-op is harmless).
  if old.redacted_at is not null then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'Redacted attribution cannot be changed' using errcode='42501';
    end if;
    return new;
  end if;
  if new.redacted_at is not null then
    -- Only the five retention-sensitive fields may be cleared. All must be
    -- SQL NULL; JSON null is not a substitute. No simultaneous enrichment.
    if new.raw_payload is not null or new.fbclid is not null
      or new.fbc is not null or new.fbp is not null or new.consent_evidence is not null
      or (to_jsonb(new)-array['raw_payload','fbclid','fbc','fbp','consent_evidence','redacted_at'])
        is distinct from (to_jsonb(old)-array['raw_payload','fbclid','fbc','fbp','consent_evidence','redacted_at']) then
      raise exception 'Invalid attribution redaction transition' using errcode='42501';
    end if;
    return new;
  end if;
  -- Before redaction, missing metadata may be enriched; populated original
  -- values cannot be replaced or cleared. Status may change independently.
  for field in select key,value from jsonb_each(to_jsonb(old)-'attribution_status') loop
    if field.value<>'null'::jsonb and field.value is distinct from to_jsonb(new)->field.key then
      raise exception 'Original attribution cannot be overwritten' using errcode='42501'; end if;
  end loop;
  return new;
end $$;
create trigger crm_attribution_immutable before update or delete on public.crm_submission_attribution
  for each row execute function crm_security.protect_attribution();

create function crm_security.protect_first_touch() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
  if new.first_submission_id is distinct from old.first_submission_id then
    raise exception 'First touch is immutable' using errcode='42501'; end if;
  return new;
end $$;
create trigger crm_lead_first_touch before update on public.crm_leads
  for each row execute function crm_security.protect_first_touch();
create function crm_security.protect_task_source() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
  if new.source_key is distinct from old.source_key or new.source_kind is distinct from old.source_kind then
    raise exception 'Task source identity is immutable' using errcode='42501'; end if;
  return new;
end $$;
create trigger crm_task_source before update on public.crm_tasks
  for each row execute function crm_security.protect_task_source();
create function crm_security.protect_policy() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
  if tg_op='DELETE' then raise exception 'Policy versions are immutable' using errcode='42501'; end if;
  if (to_jsonb(new)-'retired_at') is distinct from (to_jsonb(old)-'retired_at')
    or (old.retired_at is not null and new.retired_at is distinct from old.retired_at) then
    raise exception 'Publish a new policy version' using errcode='42501'; end if;
  return new;
end $$;
create trigger crm_policy_immutable before update or delete on public.crm_followup_policies
  for each row execute function crm_security.protect_policy();

create index crm_contacts_phone_idx on public.crm_contacts(phone_e164) where phone_e164 is not null;
create index crm_contacts_whatsapp_idx on public.crm_contacts(whatsapp_e164) where whatsapp_e164 is not null;
create index crm_contacts_email_idx on public.crm_contacts(email_normalized) where email_normalized is not null;
create index crm_contacts_merge_idx on public.crm_contacts(merged_into_contact_id) where merged_into_contact_id is not null;
create index crm_submissions_lead_time_idx on public.crm_submissions(lead_id,occurred_at desc,id desc);
create index crm_submissions_review_idx on public.crm_submissions(received_at,id) where match_status='needs_review';
create unique index crm_attribution_external_key on public.crm_submission_attribution(provider,external_scope,external_submission_id) where external_submission_id is not null;
create index crm_attribution_campaign_idx on public.crm_submission_attribution(campaign_id);
create index crm_attribution_adset_idx on public.crm_submission_attribution(adset_id);
create index crm_attribution_ad_idx on public.crm_submission_attribution(ad_id);
create index crm_attribution_form_idx on public.crm_submission_attribution(form_id);
create index crm_attribution_external_idx on public.crm_submission_attribution(external_submission_id);
create index crm_leads_status_owner_idx on public.crm_leads(status,owner_id,created_at desc,id desc);
create index crm_leads_contact_idx on public.crm_leads(contact_id,created_at desc);
create index crm_leads_active_attempt_idx on public.crm_leads(last_attempt_at,id) where status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and merged_into_lead_id is null;
create unique index crm_leads_strict_match_key on public.crm_leads(strict_match_key) where strict_match_key is not null and merged_into_lead_id is null and status in ('NEW','CONTACTING','ENGAGED','QUALIFIED');
create index crm_leads_merge_idx on public.crm_leads(merged_into_lead_id) where merged_into_lead_id is not null;
create index crm_activities_timeline_idx on public.crm_activities(lead_id,occurred_at,id);
create index crm_activities_event_idx on public.crm_activities(event_type,occurred_at,id);
create unique index crm_activities_attempt_key on public.crm_activities(lead_id,outreach_cycle,attempt_ordinal) where attempt_ordinal is not null;
create index crm_tasks_open_owner_idx on public.crm_tasks(assigned_to,due_at,id) where status='open';
create index crm_tasks_open_lead_idx on public.crm_tasks(lead_id,due_at,id) where status='open';
-- A populated ordinal identifies one slot even if a future generator uses a
-- different source_kind (for example intake rather than attempt_sequence).
create unique index crm_tasks_attempt_key on public.crm_tasks(lead_id,outreach_cycle,attempt_ordinal) where attempt_ordinal is not null;
revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
commit;

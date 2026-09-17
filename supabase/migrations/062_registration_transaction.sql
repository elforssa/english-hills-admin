begin;
alter table public.enrollments
  add column registration_request_id uuid,
  add column registration_payload_hash text,
  add column consent_at timestamptz,
  add column consent_policy_version text,
  add column consent_source text;
create unique index enrollments_registration_request_unique
  on public.enrollments (registration_request_id)
  where registration_request_id is not null;
alter table public.enrollments add constraint enrollment_public_consent_evidence
  check (registration_request_id is null or
    (registration_payload_hash is not null and consent_at is not null
     and consent_policy_version is not null and consent_source = 'public_inscription'));

create or replace function public.create_public_registration(p_payload jsonb, p_request_id uuid, p_hash text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_existing record;
  v_student_id uuid;
begin
  if p_request_id is null or p_hash !~ '^[0-9a-f]{64}$'
    or p_payload->>'consent' <> 'true'
    or coalesce(pg_catalog.btrim(p_payload->>'full_name'), '') = ''
    or coalesce(pg_catalog.btrim(p_payload->>'telephone'), '') = ''
    or (coalesce(p_payload->>'email','') = '' and coalesce(p_payload->>'parent_email','') = '') then
    raise exception 'Invalid public registration' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('registration:' || p_request_id::text, 0));
  select e.student_id, e.registration_payload_hash into v_existing
  from public.enrollments e where e.registration_request_id = p_request_id;
  if found then
    if v_existing.registration_payload_hash <> p_hash then
      raise exception 'Registration request key reused with changed data' using errcode = '23505';
    end if;
    return v_existing.student_id;
  end if;
  insert into public.students
    (full_name, date_naissance, telephone, email, parent_email, age_category,
     session_type, niveau_cefr, notes, status)
  values
    (p_payload->>'full_name', nullif(p_payload->>'date_naissance','')::date,
     p_payload->>'telephone', nullif(p_payload->>'email',''),
     nullif(p_payload->>'parent_email',''), nullif(p_payload->>'age_category',''),
     coalesce(nullif(p_payload->>'session_type',''),'Yearly'),
     nullif(p_payload->>'niveau_cefr',''), nullif(p_payload->>'notes',''), 'Prospect')
  returning id into v_student_id;
  insert into public.enrollments
    (student_id, status, date_inscription, documents_urls, notes,
     registration_request_id, registration_payload_hash, consent_at,
     consent_policy_version, consent_source)
  values
    (v_student_id, 'Submitted', (pg_catalog.clock_timestamp() at time zone 'Africa/Casablanca')::date,
     array[]::text[], nullif(p_payload->>'notes',''), p_request_id, p_hash,
     pg_catalog.clock_timestamp(), 'public-privacy-2026-09-17', 'public_inscription');
  return v_student_id;
end;
$$;
revoke all on function public.create_public_registration(jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.create_public_registration(jsonb,uuid,text) to service_role;
commit;

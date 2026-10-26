-- Batch F (plan PRF-r2, ADR-011): portal readiness for teachers and families.
-- Forward-only and transactional; it changes no existing row. Built on Plan D's
-- M2 (migration 121): teacher visibility uses academic_security.is_group_member.
--
-- Re-created from their latest cumulative definitions: get_visible_student_ids
-- (025), get_my_teacher_id (025), get_my_email (006), teacher_can_access_student_group,
-- can_message_recipient, resolve_storage_asset and storage_security.can_write (121),
-- get_teacher_directory (096), prepare_role_invitation (077), apply_pending_role
-- (042), log_activity (021), mark_message_read (047), mark_my_notifications_read
-- (028); policy "announcements audience read" (121).
--
-- Refusals raise 42501 (not allowed) or 22023 (invalid input) with a closed
-- portal.<reason> hint; deliberate conflicts raise PT409 (ADR-009).
begin;

-- Build order and pre-checks: refuse, changing nothing.
do $$ begin
  if to_regprocedure('public.attendance_student_in_group(uuid,uuid,date)') is null
    or to_regprocedure('academic_security.is_group_member(uuid,uuid)') is null then
    raise exception 'Portal readiness requires migration 121 (EGC M2) first' using errcode = '55000';
  end if;
  if exists (select 1 from public.teachers t where t.deleted_at is null and nullif(btrim(t.email), '') is not null
      group by lower(btrim(t.email)) having count(*) > 1) then
    raise exception 'Portal readiness: two active teacher records share an e-mail; resolve before applying'
      using errcode = '23505';
  end if;
end $$;

-- Private schema: no API role has usage; only SECURITY DEFINER code reaches it.
create schema portal_security;
revoke all on schema portal_security from public, anon, authenticated, service_role;

create function portal_security.norm_email(p_email text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select nullif(lower(btrim(p_email)), '')
$$;

create function portal_security.fail(p_reason text, p_code text, p_message text) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$ begin
  raise exception '%', p_message using errcode = p_code, hint = 'portal.' || p_reason;
end $$;

-- Director and admin manage family and teacher accounts (Q4 = A).
create function portal_security.require_manager() returns text
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if auth.uid() is null or v_role is null or v_role not in ('director', 'admin') then
    perform portal_security.fail('forbidden', '42501', 'Action réservée à la direction et à l’administration.');
  end if;
  return v_role;
end $$;

create function portal_security.log(p_action text, p_table text, p_id uuid, p_after jsonb) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  insert into public.activity_log(actor_id, actor_email, action, target_table, target_id, changed_columns, before, after)
  values (auth.uid(), (select p.email from public.profiles p where p.id = auth.uid()), p_action, p_table, p_id,
    array(select jsonb_object_keys(coalesce(p_after, '{}'::jsonb))), null, p_after);
end $$;

-- ── D3: explicit family links ────────────────────────────────────────────
create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  relation text not null check (relation in ('parent', 'self')),
  profile_id uuid references public.profiles(id) on delete cascade,
  invite_email text not null check (invite_email = lower(btrim(invite_email)) and invite_email <> ''),
  pending_role_id uuid references public.pending_roles(id) on delete cascade,
  status text not null check (status in ('pending', 'active', 'revoked')),
  created_by uuid,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason is null or char_length(btrim(revoke_reason)) between 1 and 200),
  constraint family_links_shape check (
    (status = 'pending' and pending_role_id is not null and profile_id is null and revoked_at is null)
    or (status = 'active' and profile_id is not null and pending_role_id is null and activated_at is not null
      and revoked_at is null)
    or (status = 'revoked' and profile_id is not null and pending_role_id is null and revoked_at is not null))
);
create unique index family_links_one_active on public.family_links (student_id, profile_id, relation)
  where status = 'active';
create unique index family_links_one_self_per_learner on public.family_links (student_id)
  where status = 'active' and relation = 'self';
create index family_links_profile_idx on public.family_links (profile_id) where profile_id is not null;
create index family_links_pending_idx on public.family_links (pending_role_id) where pending_role_id is not null;
alter table public.family_links enable row level security;
revoke all on table public.family_links from public, anon, authenticated, service_role;

-- A teacher invitation names the teacher record it binds (D3 step 6).
alter table public.pending_roles
  add column teacher_id uuid references public.teachers(id) on delete cascade,
  add constraint pending_roles_teacher_only check (teacher_id is null or role = 'teacher');

-- ── D9: e-mail normalisation ─────────────────────────────────────────────
create function portal_security.normalize_emails() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_table_name = 'students' then
    new.email := portal_security.norm_email(new.email);
    new.parent_email := portal_security.norm_email(new.parent_email);
  elsif tg_table_name = 'teachers' then
    new.email := portal_security.norm_email(new.email);
  elsif tg_table_name = 'messages' then
    new.from_user_email := portal_security.norm_email(new.from_user_email);
    new.to_user_email := portal_security.norm_email(new.to_user_email);
  elsif tg_table_name = 'notifications' then
    new.recipient_email := portal_security.norm_email(new.recipient_email);
  end if;
  return new;
end $$;
revoke all on function portal_security.normalize_emails() from public, anon, authenticated, service_role;
-- Every insert and update: a NOT VALID check still applies to any changed row.
create trigger portal_normalize_emails before insert or update on public.students
  for each row execute function portal_security.normalize_emails();
create trigger portal_normalize_emails before insert or update on public.teachers
  for each row execute function portal_security.normalize_emails();
create trigger portal_normalize_emails before insert or update on public.messages
  for each row execute function portal_security.normalize_emails();
create trigger portal_normalize_emails before insert or update on public.notifications
  for each row execute function portal_security.normalize_emails();
-- Validated by the release task after clean-up step C1. An empty value passes and
-- becomes NULL on the row's next write (trigger above).
alter table public.students add constraint students_email_normalized
  check (email = lower(btrim(email))) not valid;
alter table public.students add constraint students_parent_email_normalized
  check (parent_email = lower(btrim(parent_email))) not valid;
alter table public.teachers add constraint teachers_email_normalized
  check (email = lower(btrim(email))) not valid;
alter table public.messages add constraint messages_emails_normalized
  check (from_user_email = lower(btrim(from_user_email)) and to_user_email = lower(btrim(to_user_email))) not valid;
alter table public.notifications add constraint notifications_recipient_email_normalized
  check (recipient_email = lower(btrim(recipient_email))) not valid;

-- ── D4: teacher identity and membership ──────────────────────────────────
create unique index teachers_active_email_normalized on public.teachers (lower(btrim(email)))
  where deleted_at is null and nullif(btrim(email), '') is not null;

CREATE OR REPLACE FUNCTION public.get_my_email()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select p.email from public.profiles p where p.id = auth.uid()
$function$;

-- The teacher record bound to the account at invitation; an archived record grants nothing.
CREATE OR REPLACE FUNCTION public.get_my_teacher_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select t.id from public.profiles p join public.teachers t on t.id = p.linked_teacher_id
  where p.id = auth.uid() and p.role = 'teacher' and t.deleted_at is null
$function$;

-- The only teacher membership test: the record is not archived, one of its
-- groups (or the given one) holds the learner as a member (Plan D, D-1).
create function portal_security.teacher_member(p_teacher uuid, p_student uuid, p_group uuid default null)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select p_teacher is not null and p_student is not null
    and exists (select 1 from public.teachers t where t.id = p_teacher and t.deleted_at is null)
    and exists (select 1 from public.groups g where g.teacher_id = p_teacher
      and (p_group is null or g.id = p_group) and academic_security.is_group_member(p_student, g.id))
$$;
create function portal_security.teacher_sees(p_student uuid, p_group uuid default null)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select public.get_my_role() = 'teacher' and public.get_my_teacher_id() is not null
    and portal_security.teacher_member(public.get_my_teacher_id(), p_student, p_group)
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_access_student_group(p_student uuid, p_group uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select coalesce(portal_security.teacher_sees(p_student, p_group), false);
$function$;

-- ── D3: visibility through active links only ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_visible_student_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select fl.student_id from public.family_links fl
  join public.profiles p on p.id = fl.profile_id
  join public.students s on s.id = fl.student_id
  where fl.profile_id = auth.uid() and fl.status = 'active' and s.deleted_at is null
    and ((p.role = 'parent' and fl.relation = 'parent') or (p.role = 'student' and fl.relation = 'self'))
$function$;

-- The same rule for a given account (storage writes, recipient resolution).
create function portal_security.account_sees(p_profile uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = p_profile and (
    p.role in ('director', 'admin')
    or (p.role in ('parent', 'student') and exists (select 1 from public.family_links fl
      join public.students s on s.id = fl.student_id
      where fl.profile_id = p.id and fl.student_id = p_student and fl.status = 'active' and s.deleted_at is null
        and fl.relation = case p.role when 'parent' then 'parent' else 'self' end))
    or (p.role = 'teacher' and portal_security.teacher_member(p.linked_teacher_id, p_student))))
$$;
create function portal_security.family_linked(p_profile uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = p_profile and p.role in ('parent', 'student')
    and portal_security.account_sees(p.id, p_student))
$$;

-- ── D5: teacher academic writes, no delete, audited ──────────────────────
drop policy "attendance teacher delete" on public.attendance;
drop policy "attendance teacher insert" on public.attendance;
create policy "attendance teacher insert" on public.attendance for insert to authenticated
  with check (get_my_role() = 'teacher' and teacher_can_access_student_group(student_id, group_id));
drop policy "attendance teacher update" on public.attendance;
create policy "attendance teacher update" on public.attendance for update to authenticated
  using (get_my_role() = 'teacher' and teacher_can_access_student_group(student_id, group_id))
  with check (get_my_role() = 'teacher' and teacher_can_access_student_group(student_id, group_id));

drop policy "assessments teacher rw" on public.assessments;
create policy "assessments teacher select" on public.assessments for select to authenticated
  using (teacher_can_access_student_group(student_id, group_id));
create policy "assessments teacher insert" on public.assessments for insert to authenticated
  with check (teacher_can_access_student_group(student_id, group_id));
create policy "assessments teacher update" on public.assessments for update to authenticated
  using (teacher_can_access_student_group(student_id, group_id))
  with check (teacher_can_access_student_group(student_id, group_id));

drop policy "learnassess teacher rw" on public.learning_assessments;
create policy "learnassess teacher select" on public.learning_assessments for select to authenticated
  using (teacher_can_access_student_group(student_id, null));
create policy "learnassess teacher insert" on public.learning_assessments for insert to authenticated
  with check (teacher_can_access_student_group(student_id, null));
create policy "learnassess teacher update" on public.learning_assessments for update to authenticated
  using (teacher_can_access_student_group(student_id, null))
  with check (teacher_can_access_student_group(student_id, null));

drop policy "placement teacher rw" on public.placement_tests;
create policy "placement teacher select" on public.placement_tests for select to authenticated
  using (teacher_can_access_student_group(student_id, null));
create policy "placement teacher insert" on public.placement_tests for insert to authenticated
  with check (teacher_can_access_student_group(student_id, null));
create policy "placement teacher update" on public.placement_tests for update to authenticated
  using (teacher_can_access_student_group(student_id, null))
  with check (teacher_can_access_student_group(student_id, null));

drop policy "portfolios teacher rw" on public.portfolios;
create policy "portfolios teacher select" on public.portfolios for select to authenticated
  using (teacher_can_access_student_group(student_id, null));
create policy "portfolios teacher insert" on public.portfolios for insert to authenticated
  with check (teacher_can_access_student_group(student_id, null));
create policy "portfolios teacher update" on public.portfolios for update to authenticated
  using (teacher_can_access_student_group(student_id, null))
  with check (teacher_can_access_student_group(student_id, null));

-- Per-table safe columns: identifiers, dates, status, level, grade values and
-- terme keep their values so a director can restore a deleted grade; free text
-- (commentaire, notes, teacher_note, teacher_notes, description) stays redacted.
CREATE OR REPLACE FUNCTION public.log_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_actor_id     uuid;
  v_actor_email  text;
  v_target_id    uuid;
  v_before       jsonb;
  v_after        jsonb;
  v_changed      text[];
  k              text;
  v_safe_columns text[];
begin
  -- ── Per-table allowlist of columns whose VALUES are safe to snapshot.
  -- Anything not in the allowlist gets '<redacted>' in before/after.
  v_safe_columns := case tg_table_name
    when 'profiles' then
      array['id', 'role', 'created_at', 'updated_at']
    when 'students' then
      array['id', 'status', 'age_category', 'niveau_cefr',
            'groupe_id', 'deleted_at', 'created_at', 'updated_at']
    when 'teachers' then
      array['id', 'contract_type', 'deleted_at', 'created_at', 'updated_at']
    when 'enrollments' then
      array['id', 'student_id', 'group_id', 'status', 'date_inscription',
            'created_at', 'updated_at']
    when 'receipts' then
      array['id', 'student_id', 'statut_paiement', 'mode_paiement',
            'deleted_at', 'created_at', 'updated_at']
    when 'payments' then
      array['id', 'student_id', 'receipt_id', 'mode_paiement',
            'deleted_at', 'created_at', 'updated_at']
    when 'payroll' then
      array['id', 'teacher_id', 'mois', 'annee', 'statut',
            'created_at', 'updated_at']
    when 'leave_requests' then
      array['id', 'teacher_id', 'status', 'date_debut', 'date_fin',
            'created_at', 'updated_at']
    when 'certificates' then
      array['id', 'student_id', 'niveau_complete', 'terme', 'annee',
            'date_emission', 'issued', 'created_at', 'updated_at']
    when 'assessments' then
      array['id', 'student_id', 'group_id', 'terme', 'note_oral', 'note_ecrit',
            'note_devoirs', 'note_finale', 'poids_oral', 'poids_ecrit', 'poids_devoirs',
            'niveau_actuel', 'niveau_cible', 'created_at', 'updated_at']
    when 'learning_assessments' then
      array['id', 'student_id', 'date_assessment', 'kolb_style', 'intelligences',
            'dominant_intelligence', 'triggered_by', 'created_at', 'updated_at']
    when 'placement_tests' then
      array['id', 'student_id', 'date_test', 'heure', 'score', 'niveau_recommande',
            'status', 'groupe_affecte_id', 'crm_lead_id', 'created_at', 'updated_at']
    when 'portfolios' then
      array['id', 'student_id', 'terme', 'annee', 'niveau', 'project_type',
            'teacher_id', 'visible_to_parent', 'visible_to_student', 'created_by',
            'created_at', 'updated_at']
    when 'attendance' then
      array['id', 'student_id', 'group_id', 'session_date', 'status',
            'created_at', 'updated_at']
    else
      array['id', 'created_at', 'updated_at']
  end;

  v_actor_id := auth.uid();
  if v_actor_id is not null then
    select p.email into v_actor_email
      from public.profiles p where p.id = v_actor_id;
  end if;

  if tg_op = 'INSERT' then
    v_before    := null;
    v_after     := to_jsonb(new);
    v_target_id := (v_after->>'id')::uuid;
  elsif tg_op = 'UPDATE' then
    v_before    := to_jsonb(old);
    v_after     := to_jsonb(new);
    v_target_id := (v_after->>'id')::uuid;

    v_changed := array[]::text[];
    for k in select jsonb_object_keys(v_after) loop
      if k = 'updated_at' then continue; end if;
      if (v_before->k) is distinct from (v_after->k) then
        v_changed := array_append(v_changed, k);
      end if;
    end loop;

    if array_length(v_changed, 1) is null then
      return new;
    end if;
  else -- DELETE
    v_before    := to_jsonb(old);
    v_after     := null;
    v_target_id := (v_before->>'id')::uuid;
  end if;

  -- ── PII scrub: replace VALUES of sensitive columns with '<redacted>'.
  -- We rebuild before/after one key at a time so the structure is
  -- preserved for downstream tooling, but only allowlisted columns keep
  -- their real values.
  if v_before is not null then
    declare
      v_scrubbed jsonb := '{}'::jsonb;
    begin
      for k in select jsonb_object_keys(v_before) loop
        if k = any(v_safe_columns) then
          v_scrubbed := v_scrubbed || jsonb_build_object(k, v_before->k);
        else
          v_scrubbed := v_scrubbed || jsonb_build_object(k, to_jsonb('<redacted>'::text));
        end if;
      end loop;
      v_before := v_scrubbed;
    end;
  end if;

  if v_after is not null then
    declare
      v_scrubbed jsonb := '{}'::jsonb;
    begin
      for k in select jsonb_object_keys(v_after) loop
        if k = any(v_safe_columns) then
          v_scrubbed := v_scrubbed || jsonb_build_object(k, v_after->k);
        else
          v_scrubbed := v_scrubbed || jsonb_build_object(k, to_jsonb('<redacted>'::text));
        end if;
      end loop;
      v_after := v_scrubbed;
    end;
  end if;

  insert into public.activity_log
    (actor_id, actor_email, action, target_table,
     target_id, changed_columns, before, after)
  values
    (v_actor_id, v_actor_email, tg_op, tg_table_name,
     v_target_id, v_changed, v_before, v_after);

  return coalesce(new, old);
end;
$function$;

create trigger log_activity_t after insert or update or delete on public.assessments
  for each row execute function public.log_activity();
create trigger log_activity_t after insert or update or delete on public.learning_assessments
  for each row execute function public.log_activity();
create trigger log_activity_t after insert or update or delete on public.placement_tests
  for each row execute function public.log_activity();
create trigger log_activity_t after insert or update or delete on public.portfolios
  for each row execute function public.log_activity();
create trigger log_activity_t after insert or update or delete on public.attendance
  for each row execute function public.log_activity();

-- ── D6: student portfolio boundary ───────────────────────────────────────
-- For the student role, whatever file_url holds: teacher fields are cleared and
-- the entry is visible on insert; on update a change to them is refused, as the
-- storage binding already refuses it for asset-backed entries.
alter table public.portfolios add column created_by uuid;
create index portfolios_created_by_idx on public.portfolios (created_by) where created_by is not null;
create function portal_security.guard_portfolio() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_role text;
begin
  if tg_op = 'INSERT' then
    new.created_by := (select p.id from public.profiles p where p.id = auth.uid());
  elsif new.created_by is distinct from old.created_by then
    perform portal_security.fail('immutable_author', '42501', 'L’auteur d’une entrée de portfolio ne peut pas être modifié.');
  end if;
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role = 'student' then
    if tg_op = 'INSERT' then
      new.teacher_note := null; new.teacher_id := null;
      new.visible_to_parent := true; new.visible_to_student := true;
    elsif (new.teacher_note, new.teacher_id, new.visible_to_parent, new.visible_to_student)
        is distinct from (old.teacher_note, old.teacher_id, old.visible_to_parent, old.visible_to_student) then
      perform portal_security.fail('protected_portfolio_fields', '42501',
        'Le retour de l’enseignant et la visibilité d’une entrée ne se modifient pas depuis l’espace apprenant.');
    end if;
  end if;
  return new;
end $$;
revoke all on function portal_security.guard_portfolio() from public, anon, authenticated, service_role;
create trigger portal_portfolio_guard before insert or update on public.portfolios
  for each row execute function portal_security.guard_portfolio();
drop policy "portfolios student update" on public.portfolios;
create policy "portfolios student update" on public.portfolios for update to authenticated
  using (get_my_role() = 'student' and student_id in (select get_visible_student_ids())
    and created_by = auth.uid() and teacher_id is null)
  with check (get_my_role() = 'student' and student_id in (select get_visible_student_ids())
    and created_by = auth.uid() and teacher_id is null);
drop policy "portfolios student delete" on public.portfolios;
create policy "portfolios student delete" on public.portfolios for delete to authenticated
  using (get_my_role() = 'student' and student_id in (select get_visible_student_ids())
    and created_by = auth.uid() and teacher_id is null);

-- ── D2: portal roles read through projections, not whole rows ────────────
drop policy "students parent read self" on public.students;
drop policy "students student read self" on public.students;
drop policy "students teacher read groups" on public.students;
drop policy "enrollments parent select" on public.enrollments;
drop policy "enrollments parent insert" on public.enrollments;
drop policy "enrollments teacher read" on public.enrollments;
drop policy "receipts parent read" on public.receipts;
drop policy "receipts student financial read" on public.receipts;
drop policy "charges family read" on public.charges;
drop policy "placement parent read" on public.placement_tests;
drop policy "placement student read" on public.placement_tests;
drop policy "attendance parent read" on public.attendance;
drop policy "attendance student read" on public.attendance;
drop policy "certificates parent read" on public.certificates;
drop policy "certificates student read" on public.certificates;
revoke select on public.legacy_receipt_reconciliation from anon;

-- Teacher class list (Q1 = A): no contact field, birth date or note.
create function public.portal_teacher_roster(p_group_id uuid default null)
returns table(student_id uuid, full_name text, photo_url text, niveau_cefr text, age_category text,
  session_type text, status text, group_id uuid, enrollment_status text)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
#variable_conflict use_column
declare v_teacher uuid;
begin
  if public.get_my_role() is distinct from 'teacher' then
    perform portal_security.fail('forbidden', '42501', 'Réservé aux enseignants.');
  end if;
  v_teacher := public.get_my_teacher_id();
  if v_teacher is null then return; end if;
  if p_group_id is not null and not exists (select 1 from public.groups g where g.id = p_group_id and g.teacher_id = v_teacher) then
    perform portal_security.fail('not_your_group', '42501', 'Ce groupe ne vous est pas attribué.');
  end if;
  return query
  select r.id, r.full_name, r.photo_url, r.niveau_cefr, r.age_category, r.session_type, r.status, r.group_id, r.enrollment_status
  from (
    select distinct on (s.id, g.id) s.id, s.full_name, s.photo_url, s.niveau_cefr, s.age_category, s.session_type,
      s.status, g.id as group_id, e.status as enrollment_status
    from public.groups g
    join public.enrollments e on e.group_id = g.id and e.status in ('Validated', 'Trial')
    join public.students s on s.id = e.student_id
    where g.teacher_id = v_teacher and (p_group_id is null or g.id = p_group_id)
      and portal_security.teacher_sees(s.id, g.id)
    order by s.id, g.id, (e.status = 'Validated') desc
  ) r
  order by r.full_name, r.id, r.group_id
  limit 500;
end $$;

-- Family identity block, one row per linked learner.
create function public.portal_my_learners()
returns table(student_id uuid, full_name text, photo_url text, niveau_cefr text, age_category text,
  session_type text, status text, relation text, groups jsonb)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
#variable_conflict use_column
begin
  if public.get_my_role() is null or public.get_my_role() not in ('parent', 'student') then
    perform portal_security.fail('forbidden', '42501', 'Réservé aux familles.');
  end if;
  return query
  select s.id, s.full_name, s.photo_url, s.niveau_cefr, s.age_category, s.session_type, s.status,
    case when public.get_my_role() = 'parent' then 'parent' else 'self' end,
    coalesce((select jsonb_agg(jsonb_build_object('group_id', g.id, 'name', g.name, 'niveau', g.niveau,
        'session_type', g.session_type, 'jours', g.jours, 'horaire', g.horaire, 'salle', g.salle,
        'teacher_name', (select t.full_name from public.teachers t where t.id = g.teacher_id and t.deleted_at is null))
        order by g.name, g.id)
      from public.groups g where academic_security.is_group_member(s.id, g.id)), '[]'::jsonb)
  from public.students s
  where s.id in (select public.get_visible_student_ids())
  order by s.full_name, s.id
  limit 10;
end $$;

-- Record sections of one linked learner. Balances come from every live receipt.
create function public.portal_learner_record(p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_result jsonb; v_truncated boolean := false; n integer;
begin
  if public.get_my_role() is null or public.get_my_role() not in ('parent', 'student') then
    perform portal_security.fail('forbidden', '42501', 'Réservé aux familles.');
  end if;
  if p_student_id is null or p_student_id not in (select public.get_visible_student_ids()) then
    perform portal_security.fail('not_linked', '42501', 'Cet apprenant n’est pas lié à votre compte.');
  end if;
  select jsonb_build_object(
    'enrollments', coalesce((select jsonb_agg(x order by x.date_inscription desc nulls last, x.created_at desc) from (
      select e.id, e.status, e.session_type, e.level, e.school_year, e.group_id,
        (select g.name from public.groups g where g.id = e.group_id) as group_name, e.date_inscription, e.created_at
      from public.enrollments e where e.student_id = p_student_id
      order by e.date_inscription desc nulls last, e.created_at desc limit 100) x), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(x order by x.date desc nulls last, x.created_at desc) from (
      select r.id, r.student_id, r.charge_id, r.receipt_number, r.date, r.nom_prenom, r.session_type, r.school_year_snapshot,
        r.niveau, r.service_description, r.mode_paiement, r.transaction_reference, r.montant_total, r.montant_paye,
        r.remise, r.gross_amount_snapshot, r.discount_amount_snapshot, r.net_amount_snapshot, r.paid_before_snapshot,
        r.balance_after_snapshot, r.statut_paiement, r.voided_at, coalesce(r.legacy, false) as is_legacy, r.created_at
      from public.receipts r where r.student_id = p_student_id and r.deleted_at is null
      order by r.date desc nulls last, r.created_at desc limit 100) x), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(x order by x.due_date desc nulls last, x.created_at desc) from (
      select c.id, c.session_type, c.service_description, c.level, c.school_year, c.due_date, c.net_amount,
        c.paid_amount, c.balance, c.settlement_status, c.voided_at is not null as voided, c.created_at
      from public.charge_balances c where c.student_id = p_student_id
      order by c.due_date desc nulls last, c.created_at desc limit 100) x), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(x order by x.session_date desc) from (
      select a.id, a.session_date, a.status from public.attendance a where a.student_id = p_student_id
      order by a.session_date desc limit 200) x), '[]'::jsonb),
    'placement_tests', coalesce((select jsonb_agg(x order by x.date_test desc nulls last) from (
      select pt.id, pt.date_test, pt.score, pt.niveau_recommande, pt.status from public.placement_tests pt
      where pt.student_id = p_student_id and pt.crm_lead_id is null
      order by pt.date_test desc nulls last, pt.created_at desc limit 100) x), '[]'::jsonb),
    'certificates', coalesce((select jsonb_agg(x order by x.date_emission desc nulls last) from (
      select c.id, c.niveau_complete, c.terme, c.annee, c.date_emission, c.directeur from public.certificates c
      where c.student_id = p_student_id and c.issued is true
      order by c.date_emission desc nulls last, c.created_at desc limit 100) x), '[]'::jsonb)
  ) into v_result;
  select count(*) into n from public.enrollments where student_id = p_student_id; v_truncated := v_truncated or n > 100;
  select count(*) into n from public.receipts where student_id = p_student_id and deleted_at is null; v_truncated := v_truncated or n > 100;
  select count(*) into n from public.charges where student_id = p_student_id; v_truncated := v_truncated or n > 100;
  select count(*) into n from public.attendance where student_id = p_student_id; v_truncated := v_truncated or n > 200;
  select count(*) into n from public.placement_tests where student_id = p_student_id and crm_lead_id is null; v_truncated := v_truncated or n > 100;
  select count(*) into n from public.certificates where student_id = p_student_id and issued is true; v_truncated := v_truncated or n > 100;
  return v_result || jsonb_build_object('truncated', v_truncated);
end $$;

-- Replaces the "enrollments parent insert" policy: the same Submitted request.
create function public.portal_request_reenrollment(p_student_id uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_id uuid;
begin
  if public.get_my_role() is distinct from 'parent' then
    perform portal_security.fail('forbidden', '42501', 'Réservé aux parents.');
  end if;
  if p_student_id is null or p_student_id not in (select public.get_visible_student_ids()) then
    perform portal_security.fail('not_linked', '42501', 'Cet apprenant n’est pas lié à votre compte.');
  end if;
  insert into public.enrollments(student_id, status, date_inscription, notes)
  values (p_student_id, 'Submitted', (now() at time zone 'Africa/Casablanca')::date,
    'Demande de réinscription envoyée depuis l’espace parent.')
  returning id into v_id;
  return v_id;
end $$;

-- ── D3: invitation lifecycle ─────────────────────────────────────────────
-- 077's prepare_role_invitation body, unchanged except that a re-invitation
-- drops the earlier pending links and teacher record of the queue row, and the
-- queue id is returned to the portal callers.
create function portal_security.queue_role_invitation(p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$ declare
  actor_role text; target public.profiles%rowtype;
  normalized_email text := lower(btrim(p_email)); queue_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if normalized_email is null or length(normalized_email) > 254 or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('portal.invite:' || normalized_email, 0));
  update role_security.director_guard set director_count = director_count where singleton;
  select role into actor_role from public.profiles where id = auth.uid();
  -- Auth email is authoritative. Refuse profile/Auth disagreement, not a
  -- second invitation that could later attach to the wrong identity.
  if exists (select 1 from public.profiles p join auth.users u on u.id=p.id
    where (lower(btrim(p.email))=normalized_email or lower(btrim(u.email))=normalized_email)
    and lower(btrim(p.email)) is distinct from lower(btrim(u.email))) then
    raise exception 'Account email requires reconciliation' using errcode = '23514';
  end if;
  select p.* into target from public.profiles p join auth.users u on u.id=p.id
    where lower(btrim(u.email)) = normalized_email for update of p;
  if actor_role is distinct from 'director' and exists (
    select 1 from public.pending_roles where lower(btrim(email))=normalized_email and role='receptionist'
  ) then raise exception 'Director required for receptionist invitation' using errcode='42501'; end if;
  perform role_security.assert_transition(actor_role, coalesce(target.role, 'pending'), p_role);
  if target.id is not null and target.role <> 'pending' then
    if target.role <> p_role then
      raise exception 'Use explicit role management for an existing account' using errcode = '23514';
    end if;
    delete from public.pending_roles where lower(btrim(email)) = normalized_email;
    return jsonb_build_object('success', true, 'alreadyRegistered', true, 'needsDelivery', false,
      'userId', target.id, 'role', target.role, 'email', normalized_email);
  end if;
  insert into public.pending_roles(email,role,invited_by,target_user_id,expires_at)
    values(normalized_email,p_role,auth.uid(),target.id,now()+interval '7 days')
    on conflict (lower(btrim(email))) do update set role=excluded.role,
      invited_by=excluded.invited_by, target_user_id=excluded.target_user_id,
      expires_at=excluded.expires_at, teacher_id=null
    returning id into queue_id;
  delete from public.family_links where pending_role_id = queue_id and status = 'pending';
  insert into public.activity_log(actor_id,action,target_table,target_id,changed_columns,after)
    values(auth.uid(),'INSERT','pending_roles',queue_id,array['role','invited_by','target_user_id','expires_at'],
      jsonb_build_object('role',p_role,'invited_by',auth.uid(),'target_user_id',target.id));
  return jsonb_build_object('success',true,'alreadyRegistered',target.id is not null,
    'needsDelivery',not exists(select 1 from auth.users where id=target.id and email_confirmed_at is not null),
    'userId',target.id,'role',p_role,'email',normalized_email,'queueId',queue_id);
end $$;

-- Portal roles take the portal invitations; staff roles keep this path unchanged.
CREATE OR REPLACE FUNCTION public.prepare_role_invitation(p_email text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ begin
  if p_role in ('parent', 'student', 'teacher') then
    perform portal_security.fail('use_portal_invitation', '42501',
      'Les comptes parent, apprenant et enseignant passent par l’invitation dédiée.');
  end if;
  return portal_security.queue_role_invitation(p_email, p_role) - 'queueId';
end $function$;

-- The address only proposes: refusals shared by preview, invitation and later links.
create function portal_security.family_matches(p_email text, p_role text) returns uuid[]
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce(array_agg(s.id order by s.full_name, s.id), '{}'::uuid[]) from public.students s
  where s.deleted_at is null
    and portal_security.norm_email(case p_role when 'parent' then s.parent_email else s.email end) = p_email
$$;
create function portal_security.check_family_address(p_email text, p_role text) returns uuid[]
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_matches uuid[];
begin
  if p_role is null or p_role not in ('parent', 'student') then
    perform portal_security.fail('invalid_role', '22023', 'Rôle d’invitation famille invalide.');
  end if;
  if p_email is null or length(p_email) > 254 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    perform portal_security.fail('invalid_email', '22023', 'Adresse e-mail invalide.');
  end if;
  if split_part(p_email, '@', 2) = 'english-hills.com' then
    perform portal_security.fail('centre_address', '42501', 'Une adresse du centre ne peut pas ouvrir un compte famille.');
  end if;
  if exists (select 1 from public.profiles p where portal_security.norm_email(p.email) = p_email
      and p.role in ('director', 'admin', 'receptionist', 'teacher')) then
    perform portal_security.fail('staff_address', '42501', 'Cette adresse appartient à un compte du personnel.');
  end if;
  if exists (select 1 from public.teachers t where portal_security.norm_email(t.email) = p_email) then
    perform portal_security.fail('teacher_address', '42501', 'Cette adresse est celle d’une fiche enseignant.');
  end if;
  v_matches := portal_security.family_matches(p_email, p_role);
  if cardinality(v_matches) = 0 then
    perform portal_security.fail('no_match', '22023', 'Aucun apprenant actif ne porte cette adresse.');
  end if;
  if (p_role = 'parent' and cardinality(v_matches) > 4) or (p_role = 'student' and cardinality(v_matches) > 1) then
    perform portal_security.fail('shared_address', '42501',
      'Adresse partagée par plusieurs familles — corrigez les fiches avant d’inviter.');
  end if;
  if p_role = 'student' and exists (select 1 from public.students s where s.deleted_at is null
      and portal_security.norm_email(s.parent_email) = p_email and s.id <> v_matches[1]) then
    perform portal_security.fail('address_is_parent', '42501',
      'Cette adresse est l’adresse parent d’un autre apprenant — corrigez les fiches avant d’inviter.');
  end if;
  return v_matches;
end $$;
create function portal_security.check_family_selection(p_email text, p_role text, p_student_ids uuid[]) returns uuid[]
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_matches uuid[] := portal_security.check_family_address(p_email, p_role); v_selected uuid[];
begin
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_selected from unnest(p_student_ids) x where x is not null;
  if cardinality(v_selected) = 0 then
    perform portal_security.fail('no_learner', '22023', 'Choisissez au moins un apprenant.');
  end if;
  if not v_selected <@ v_matches then
    perform portal_security.fail('not_matched', '22023', 'Un apprenant choisi ne porte pas cette adresse.');
  end if;
  if p_role = 'student' and exists (select 1 from public.students s where s.id = any(v_selected)
      and s.age_category = 'Young Learners (6-12)') then
    perform portal_security.fail('young_learner_self', '42501',
      'Un enfant (6–12 ans) n’a pas de compte apprenant : invitez le parent.');
  end if;
  return v_selected;
end $$;

-- Creates or re-checks an active link; serialised on the account.
create function portal_security.activate_link(p_profile uuid, p_student uuid, p_relation text, p_email text,
  p_link uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_id uuid;
begin
  perform 1 from public.profiles where id = p_profile for update;
  if not exists (select 1 from public.students s where s.id = p_student and s.deleted_at is null) then
    perform portal_security.fail('archived_learner', '22023', 'Cet apprenant est archivé.');
  end if;
  if exists (select 1 from public.family_links where student_id = p_student and profile_id = p_profile
      and relation = p_relation and status = 'active') then
    perform portal_security.fail('link_exists', 'PT409', 'Ce compte est déjà lié à cet apprenant.');
  end if;
  if p_relation = 'self' and (exists (select 1 from public.family_links where student_id = p_student
      and relation = 'self' and status = 'active')
    or exists (select 1 from public.family_links where profile_id = p_profile and relation = 'self' and status = 'active')) then
    perform portal_security.fail('self_link_exists', 'PT409', 'Un compte apprenant est déjà lié.');
  end if;
  if p_relation = 'parent' and (select count(*) from public.family_links where profile_id = p_profile
      and relation = 'parent' and status = 'active') >= 4 then
    perform portal_security.fail('link_limit', '42501', 'Un compte parent est lié à 4 apprenants au plus.');
  end if;
  if p_link is null then
    insert into public.family_links(student_id, relation, profile_id, invite_email, status, created_by, activated_at)
    values (p_student, p_relation, p_profile, p_email, 'active', auth.uid(), now())
    returning id into v_id;
  else
    update public.family_links set profile_id = p_profile, status = 'active', activated_at = now(), pending_role_id = null
    where id = p_link and status = 'pending' returning id into v_id;
  end if;
  perform portal_security.log(case when p_link is null then 'INSERT' else 'UPDATE' end, 'family_links', v_id,
    jsonb_build_object('student_id', p_student, 'relation', p_relation, 'profile_id', p_profile, 'status', 'active'));
  return v_id;
end $$;

-- What an address would open: learners, groups and the confirmation flags; no address echoed.
create function public.preview_family_invitation(p_email text, p_role text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_email text := portal_security.norm_email(p_email); v_matches uuid[]; v_hint text; v_message text; v_refusal jsonb;
begin
  perform portal_security.require_manager();
  v_matches := portal_security.family_matches(v_email, p_role);
  begin
    perform portal_security.check_family_address(v_email, p_role);
    if p_role = 'student' and cardinality(v_matches) > 0 then
      perform portal_security.check_family_selection(v_email, p_role, v_matches);
    end if;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_message = message_text;
    if coalesce(v_hint, '') not like 'portal.%' then raise; end if;
    v_refusal := jsonb_build_object('reason', v_hint, 'message', v_message);
  end;
  return jsonb_build_object(
    'refusal', v_refusal,
    'matches', coalesce((select jsonb_agg(jsonb_build_object('student_id', s.id, 'full_name', s.full_name,
        'age_category', s.age_category, 'status', s.status,
        'groups', coalesce((select jsonb_agg(g.name order by g.name) from public.groups g
          where academic_security.is_group_member(s.id, g.id)), '[]'::jsonb),
        'linked', exists (select 1 from public.family_links fl where fl.student_id = s.id and fl.status = 'active'
          and fl.relation = case p_role when 'parent' then 'parent' else 'self' end))
      order by s.full_name, s.id) from public.students s where s.id = any(v_matches)), '[]'::jsonb),
    'mixed_surnames', (select count(distinct lower(regexp_replace(btrim(s.full_name), '^.*\s', ''))) > 1
      from public.students s where s.id = any(v_matches)),
    'mixed_phones', (select count(distinct regexp_replace(s.telephone, '\D', '', 'g')) > 1
      from public.students s where s.id = any(v_matches) and nullif(regexp_replace(s.telephone, '\D', '', 'g'), '') is not null));
end $$;

-- Queue and links in one transaction; a concurrent invitation of the address is a conflict.
create function public.prepare_family_invitation(p_email text, p_role text, p_student_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_email text := portal_security.norm_email(p_email); v_selected uuid[]; v_result jsonb; v_queue uuid;
  v_relation text := case p_role when 'parent' then 'parent' else 'self' end; v_links jsonb := '[]'::jsonb; v_id uuid; sid uuid;
begin
  perform portal_security.require_manager();
  if v_email is null or not pg_try_advisory_xact_lock(hashtextextended('portal.invite:' || v_email, 0)) then
    if v_email is null then perform portal_security.fail('invalid_email', '22023', 'Adresse e-mail invalide.'); end if;
    perform portal_security.fail('stale', 'PT409', 'Une autre invitation de cette adresse est en cours. Rechargez.');
  end if;
  v_selected := portal_security.check_family_selection(v_email, p_role, p_student_ids);
  v_result := portal_security.queue_role_invitation(v_email, p_role);
  v_queue := (v_result->>'queueId')::uuid;
  foreach sid in array v_selected loop
    if v_queue is not null then
      insert into public.family_links(student_id, relation, invite_email, pending_role_id, status, created_by)
      values (sid, v_relation, v_email, v_queue, 'pending', auth.uid()) returning id into v_id;
      perform portal_security.log('INSERT', 'family_links', v_id,
        jsonb_build_object('student_id', sid, 'relation', v_relation, 'status', 'pending'));
      v_links := v_links || jsonb_build_object('id', v_id, 'student_id', sid, 'status', 'pending');
    else
      -- The account already holds this role: the links are active at once.
      v_id := portal_security.activate_link((v_result->>'userId')::uuid, sid, v_relation, v_email);
      v_links := v_links || jsonb_build_object('id', v_id, 'student_id', sid, 'status', 'active');
    end if;
  end loop;
  return (v_result - 'queueId') || jsonb_build_object('links', v_links);
end $$;

create function portal_security.check_teacher_record(p_email text, p_teacher uuid, p_profile uuid) returns void
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  if p_email is null or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    perform portal_security.fail('invalid_email', '22023', 'Adresse e-mail invalide.');
  end if;
  if (select count(*) from public.teachers t where t.deleted_at is null and portal_security.norm_email(t.email) = p_email) <> 1
    or not exists (select 1 from public.teachers t where t.id = p_teacher and t.deleted_at is null
      and portal_security.norm_email(t.email) = p_email) then
    perform portal_security.fail('teacher_mismatch', '22023',
      'L’adresse doit être celle de la fiche enseignant choisie (fiche active).');
  end if;
  if exists (select 1 from public.profiles p where p.linked_teacher_id = p_teacher
      and p.id is distinct from p_profile) then
    perform portal_security.fail('teacher_already_linked', 'PT409', 'Cette fiche enseignant est déjà liée à un compte.');
  end if;
end $$;

create function portal_security.bind_teacher(p_profile uuid, p_teacher uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_current uuid;
begin
  select p.linked_teacher_id into v_current from public.profiles p where p.id = p_profile for update;
  if v_current = p_teacher then
    perform portal_security.fail('link_exists', 'PT409', 'Ce compte est déjà lié à cette fiche enseignant.');
  end if;
  if v_current is not null and exists (select 1 from public.teachers t where t.id = v_current and t.deleted_at is null) then
    perform portal_security.fail('teacher_account_linked', 'PT409', 'Ce compte est déjà lié à une autre fiche enseignant.');
  end if;
  update public.profiles set linked_teacher_id = p_teacher where id = p_profile;
  perform portal_security.log('UPDATE', 'profiles', p_profile, jsonb_build_object('linked_teacher_id', p_teacher));
end $$;

create function public.prepare_teacher_invitation(p_email text, p_teacher_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_email text := portal_security.norm_email(p_email); v_result jsonb; v_queue uuid;
begin
  perform portal_security.require_manager();
  if v_email is null or not pg_try_advisory_xact_lock(hashtextextended('portal.invite:' || v_email, 0)) then
    if v_email is null then perform portal_security.fail('invalid_email', '22023', 'Adresse e-mail invalide.'); end if;
    perform portal_security.fail('stale', 'PT409', 'Une autre invitation de cette adresse est en cours. Rechargez.');
  end if;
  perform portal_security.check_teacher_record(v_email, p_teacher_id,
    (select p.id from public.profiles p where portal_security.norm_email(p.email) = v_email limit 1));
  v_result := portal_security.queue_role_invitation(v_email, 'teacher');
  v_queue := (v_result->>'queueId')::uuid;
  if v_queue is not null then
    update public.pending_roles set teacher_id = p_teacher_id where id = v_queue;
  else
    perform portal_security.bind_teacher((v_result->>'userId')::uuid, p_teacher_id);
  end if;
  return (v_result - 'queueId') || jsonb_build_object('teacherId', p_teacher_id,
    'teacherHasGroup', exists (select 1 from public.groups g where g.teacher_id = p_teacher_id));
end $$;

-- 042 lineage, with the portal block after the role is set and before the queue row goes.
CREATE OR REPLACE FUNCTION public.apply_pending_role()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare target public.profiles%rowtype; queued public.pending_roles%rowtype;
  issuer_role text; verified_email text; pending public.family_links%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update role_security.director_guard set director_count = director_count where singleton;
  select * into target from public.profiles where id=auth.uid() for update;
  select email into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if target.id is null or verified_email is null
    or lower(btrim(target.email)) is distinct from lower(btrim(verified_email)) then return null; end if;
  select * into queued from public.pending_roles where lower(btrim(email))=lower(btrim(verified_email)) for update;
  if queued.id is null then return null; end if;
  select role into issuer_role from public.profiles where id=queued.invited_by;
  -- One-shot, pending-only, identity-bound and reauthorized at consumption.
  if target.role <> 'pending' or queued.invited_by is null or queued.expires_at is null
    or queued.expires_at <= now() or (queued.target_user_id is not null and queued.target_user_id <> target.id)
    or (issuer_role='director' or (issuer_role='admin' and queued.role in ('student','parent','teacher'))) is not true then
    delete from public.pending_roles where id=queued.id;
    return null;
  end if;
  perform role_security.assert_transition(issuer_role,target.role,queued.role);
  update public.profiles set role=queued.role where id=target.id;
  -- Portal links: activate this queue row's pending links of the matching
  -- relation, detached from the queue row before it is deleted. A link that no
  -- longer passes its checks stays pending and goes with the queue row.
  if queued.role in ('parent','student') then
    for pending in select * from public.family_links where pending_role_id = queued.id and status = 'pending'
        and relation = case queued.role when 'parent' then 'parent' else 'self' end order by created_at, id loop
      begin
        perform portal_security.activate_link(target.id, pending.student_id, pending.relation, pending.invite_email, pending.id);
      exception when sqlstate 'PT409' or sqlstate '42501' or sqlstate '22023' then null;
      end;
    end loop;
  elsif queued.role = 'teacher' and queued.teacher_id is not null
    and exists (select 1 from public.teachers t where t.id = queued.teacher_id and t.deleted_at is null)
    and not exists (select 1 from public.profiles p where p.linked_teacher_id = queued.teacher_id and p.id <> target.id) then
    update public.profiles set linked_teacher_id = queued.teacher_id where id = target.id;
  end if;
  delete from public.pending_roles where id=queued.id;
  insert into public.activity_log(actor_id,action,target_table,target_id,changed_columns,after)
    values(auth.uid(),'DELETE','pending_roles',queued.id,array['role'],
      jsonb_build_object('activated_role',queued.role,'authorized_by',queued.invited_by));
  return queued.role;
end $function$;

-- Later links for an existing account, under the same refusals.
create function public.link_family_student(p_profile_id uuid, p_student_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_account public.profiles%rowtype; v_email text; v_relation text; v_id uuid;
begin
  perform portal_security.require_manager();
  select * into v_account from public.profiles where id = p_profile_id for update;
  if v_account.id is null or v_account.role not in ('parent', 'student') then
    perform portal_security.fail('not_family_account', '22023', 'Ce compte n’est pas un compte parent ou apprenant.');
  end if;
  v_email := portal_security.norm_email(v_account.email);
  if v_email is null or not pg_try_advisory_xact_lock(hashtextextended('portal.invite:' || v_email, 0)) then
    perform portal_security.fail('stale', 'PT409', 'Une autre opération sur ce compte est en cours. Rechargez.');
  end if;
  perform portal_security.check_family_selection(v_email, v_account.role, array[p_student_id]);
  v_relation := case v_account.role when 'parent' then 'parent' else 'self' end;
  v_id := portal_security.activate_link(v_account.id, p_student_id, v_relation, v_email);
  return jsonb_build_object('id', v_id, 'student_id', p_student_id, 'relation', v_relation, 'status', 'active');
end $$;

create function public.link_teacher_account(p_profile_id uuid, p_teacher_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_account public.profiles%rowtype;
begin
  perform portal_security.require_manager();
  select * into v_account from public.profiles where id = p_profile_id for update;
  if v_account.id is null or v_account.role <> 'teacher' then
    perform portal_security.fail('not_teacher_account', '22023', 'Ce compte n’est pas un compte enseignant.');
  end if;
  perform portal_security.check_teacher_record(portal_security.norm_email(v_account.email), p_teacher_id, v_account.id);
  perform portal_security.bind_teacher(v_account.id, p_teacher_id);
  return jsonb_build_object('profile_id', v_account.id, 'teacher_id', p_teacher_id);
end $$;

create function public.revoke_family_link(p_link_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_link public.family_links%rowtype;
begin
  perform portal_security.require_manager();
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 200 then
    perform portal_security.fail('invalid_reason', '22023', 'Indiquez un motif (200 caractères au plus).');
  end if;
  select * into v_link from public.family_links where id = p_link_id for update;
  if v_link.id is null or v_link.status <> 'active' then
    perform portal_security.fail('link_not_active', 'PT409', 'Cet accès n’est plus actif. Rechargez.');
  end if;
  update public.family_links set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(),
    revoke_reason = btrim(p_reason) where id = p_link_id;
  perform portal_security.log('UPDATE', 'family_links', p_link_id,
    jsonb_build_object('student_id', v_link.student_id, 'relation', v_link.relation, 'status', 'revoked'));
  return jsonb_build_object('id', p_link_id, 'status', 'revoked');
end $$;

-- Learner file panel: director, admin and (read-only) receptionist.
create function public.list_family_links(p_student_id uuid)
returns table(id uuid, relation text, status text, account_email text, account_name text,
  created_at timestamptz, activated_at timestamptz, revoked_at timestamptz, address_differs boolean)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
#variable_conflict use_column
begin
  if public.get_my_role() is null or public.get_my_role() not in ('director', 'admin', 'receptionist') then
    perform portal_security.fail('forbidden', '42501', 'Réservé au personnel.');
  end if;
  return query
  select fl.id, fl.relation, fl.status, coalesce(p.email, fl.invite_email), p.full_name, fl.created_at,
    fl.activated_at, fl.revoked_at,
    fl.status = 'active' and portal_security.norm_email(p.email) is distinct from
      portal_security.norm_email(case fl.relation when 'parent' then s.parent_email else s.email end)
  from public.family_links fl join public.students s on s.id = fl.student_id
  left join public.profiles p on p.id = fl.profile_id
  where fl.student_id = p_student_id
  order by (fl.status = 'active') desc, fl.created_at desc
  limit 50;
end $$;

-- ── D7b: portal inboxes keyed by account ─────────────────────────────────
alter table public.notifications add column recipient_profile_id uuid references public.profiles(id) on delete set null;
alter table public.messages
  add column recipient_profile_id uuid references public.profiles(id) on delete set null,
  add column sender_profile_id uuid references public.profiles(id) on delete set null;
create index notifications_recipient_profile_idx on public.notifications (recipient_profile_id, created_at desc)
  where recipient_profile_id is not null;
create index messages_recipient_profile_idx on public.messages (recipient_profile_id, created_at desc)
  where recipient_profile_id is not null;
create index messages_sender_profile_idx on public.messages (sender_profile_id, created_at desc)
  where sender_profile_id is not null;

-- The account behind an address that may see the row: a linked family account,
-- the teacher of the learner or director/admin; learner-less rows only staff or teacher.
create function portal_security.recipient_for(p_email text, p_student uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select p.id from public.profiles p
  where portal_security.norm_email(p_email) is not null
    and portal_security.norm_email(p.email) = portal_security.norm_email(p_email)
    and case when p_student is null then p.role in ('director', 'admin', 'teacher')
      else portal_security.account_sees(p.id, p_student) end
  order by p.created_at, p.id limit 1
$$;
create function portal_security.set_recipient() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_table_name = 'messages' then
    new.recipient_profile_id := portal_security.recipient_for(new.to_user_email, new.student_id);
    if tg_op = 'INSERT' then
      new.sender_profile_id := (select p.id from public.profiles p where p.id = auth.uid());
    elsif new.sender_profile_id is distinct from old.sender_profile_id
      and not (new.sender_profile_id is null
        and not exists (select 1 from public.profiles p where p.id = old.sender_profile_id)) then
      new.sender_profile_id := old.sender_profile_id;
    end if;
  else
    new.recipient_profile_id := portal_security.recipient_for(new.recipient_email, new.student_id);
  end if;
  return new;
end $$;
revoke all on function portal_security.set_recipient() from public, anon, authenticated, service_role;
create trigger portal_recipient before insert or update of to_user_email, student_id, recipient_profile_id, sender_profile_id
  on public.messages for each row execute function portal_security.set_recipient();
create trigger portal_recipient before insert or update of recipient_email, student_id, recipient_profile_id
  on public.notifications for each row execute function portal_security.set_recipient();

-- A portal reader sees a row about a learner only while it may see the learner.
create function portal_security.caller_sees_row(p_student uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select p_student is null
    or (public.get_my_role() in ('parent', 'student') and p_student in (select public.get_visible_student_ids()))
    or (public.get_my_role() = 'teacher' and portal_security.teacher_sees(p_student, null))
$$;

drop policy "notifications self read" on public.notifications;
create policy "notifications self read" on public.notifications for select to authenticated
  using ((get_my_role() in ('director', 'admin') and recipient_email = lower(btrim(get_my_email())))
    or (get_my_role() in ('teacher', 'parent', 'student') and recipient_profile_id = auth.uid()
      and (student_id is null
        or (get_my_role() in ('parent', 'student') and student_id in (select get_visible_student_ids()))
        or (get_my_role() = 'teacher' and teacher_can_access_student_group(student_id, null)))));
drop policy "messages self read" on public.messages;
create policy "messages self read" on public.messages for select to authenticated
  using (get_my_role() in ('director', 'admin')
    and (to_user_email = lower(btrim(get_my_email())) or from_user_email = lower(btrim(get_my_email()))));
drop policy "messages self insert" on public.messages;
create policy "messages self insert" on public.messages for insert to authenticated
  with check (get_my_role() in ('director', 'admin') and from_user_email = lower(btrim(get_my_email()))
    and can_message_recipient(to_user_email));

CREATE OR REPLACE FUNCTION public.mark_my_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  updated  integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update public.notifications n
     set read_at = now()
   where n.recipient_profile_id = auth.uid()
     and n.read_at is null
     and portal_security.caller_sees_row(n.student_id);

  get diagnostics updated = row_count;
  return updated;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_message_read(p_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.messages m
    where m.id = p_message_id and m.recipient_profile_id = auth.uid()
      and portal_security.caller_sees_row(m.student_id)
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.messages
  set read = true
  where id = p_message_id and read is distinct from true;
  return true;
end;
$function$;

-- ── D7: messaging through the centre ─────────────────────────────────────
-- Q6 = C: the office login (role admin) named in app_config by the release task.
create function portal_security.office_profile() returns uuid
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select p.id from public.app_config c join public.profiles p
    on c.value ~ '^[0-9a-fA-F-]{36}$' and p.id = c.value::uuid
  where c.key = 'portal_office_profile_id' and p.role = 'admin'
  limit 1
$$;
create function portal_security.first_name(p_name text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select split_part(btrim(coalesce(p_name, '')), ' ', 1)
$$;

create function public.portal_message_recipients()
returns table(recipient_key text, label text, student_ids uuid[])
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
#variable_conflict use_column
declare v_role text := public.get_my_role(); v_teacher uuid := public.get_my_teacher_id();
begin
  if v_role is null or v_role not in ('teacher', 'parent', 'student') then
    perform portal_security.fail('forbidden', '42501', 'Messagerie réservée aux espaces enseignant et famille.');
  end if;
  return query
  select * from (
    select 'office'::text, 'Accueil English Hills'::text, null::uuid[]
    where portal_security.office_profile() is not null
    union all
    select 'teacher:' || t.id, t.full_name || ' — enseignant', array_agg(distinct v.sid order by v.sid)
    from public.get_visible_student_ids() v(sid)
    join public.groups g on academic_security.is_group_member(v.sid, g.id)
    join public.teachers t on t.id = g.teacher_id and t.deleted_at is null
    where v_role in ('parent', 'student')
      and exists (select 1 from public.profiles p where p.linked_teacher_id = t.id and p.role = 'teacher')
    group by t.id, t.full_name
    union all
    select k.recipient_key, k.label, array[k.sid] from (
      select distinct on (s.id, fl.relation)
        case fl.relation when 'parent' then 'parent:' else 'learner:' end || s.id as recipient_key,
        case fl.relation when 'parent' then 'Parent de ' || s.full_name else s.full_name end as label,
        s.id as sid, s.full_name, fl.relation
      from public.groups g
      join public.enrollments e on e.group_id = g.id and e.status in ('Validated', 'Trial')
      join public.students s on s.id = e.student_id
      join public.family_links fl on fl.student_id = s.id and fl.status = 'active'
      join public.profiles p on p.id = fl.profile_id
        and p.role = case fl.relation when 'parent' then 'parent' else 'student' end
      where v_role = 'teacher' and g.teacher_id = v_teacher and portal_security.teacher_sees(s.id, g.id)
      order by s.id, fl.relation) k
  ) x
  limit 200;
end $$;

create function public.portal_send_message(p_recipient_key text, p_subject text, p_body text,
  p_reply_to_id uuid default null, p_student_id uuid default null) returns uuid[]
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_role text := public.get_my_role(); v_me public.profiles%rowtype; v_teacher uuid := public.get_my_teacher_id();
  v_kind text; v_target uuid; v_student uuid; v_candidates uuid[]; v_from_name text; v_to_name text;
  v_recipients uuid[]; v_ids uuid[] := '{}'::uuid[]; v_original public.messages%rowtype; v_id uuid; rid uuid;
  v_subject text := btrim(coalesce(p_subject, '')); v_body text := btrim(coalesce(p_body, ''));
begin
  if v_role is null or v_role not in ('teacher', 'parent', 'student') then
    perform portal_security.fail('forbidden', '42501', 'Messagerie réservée aux espaces enseignant et famille.');
  end if;
  select * into v_me from public.profiles where id = auth.uid();
  if char_length(v_subject) not between 1 and 200 or char_length(v_body) not between 1 and 4000 then
    perform portal_security.fail('invalid_message', '22023', 'Objet (200) et message (4000) sont requis.');
  end if;
  if not public.consume_rate_limit('email_send:minute') or not public.consume_rate_limit('email_send:hour') then
    perform portal_security.fail('rate_limited', '42501', 'Trop de messages. Patientez avant de réessayer.');
  end if;

  if p_reply_to_id is not null then
    select * into v_original from public.messages m where m.id = p_reply_to_id and m.recipient_profile_id = auth.uid()
      and portal_security.caller_sees_row(m.student_id);
    if v_original.id is null or v_original.sender_profile_id is null then
      perform portal_security.fail('no_linked_account', '42501', 'Ce message ne peut pas recevoir de réponse.');
    end if;
    v_recipients := array[v_original.sender_profile_id];
    v_student := v_original.student_id;
    v_to_name := v_original.from_name;
  else
    v_kind := split_part(coalesce(p_recipient_key, ''), ':', 1);
    if v_kind <> 'office' then
      begin v_target := nullif(split_part(p_recipient_key, ':', 2), '')::uuid;
      exception when invalid_text_representation then v_target := null; end;
      if v_target is null then
        perform portal_security.fail('invalid_recipient', '22023', 'Destinataire inconnu.');
      end if;
    end if;
    if v_kind = 'office' then
      v_recipients := array_remove(array[portal_security.office_profile()], null);
      if cardinality(v_recipients) = 0 then
        perform portal_security.fail('office_not_configured', '42501', 'L’accueil n’est pas encore joignable par messagerie.');
      end if;
      v_to_name := 'Accueil English Hills';
      if v_role = 'teacher' then
        if p_student_id is not null and not portal_security.teacher_sees(p_student_id, null) then
          perform portal_security.fail('not_linked', '42501', 'Cet apprenant n’est pas dans vos groupes.');
        end if;
        v_student := p_student_id;
      else
        select array_agg(x) into v_candidates from public.get_visible_student_ids() x;
      end if;
    elsif v_kind = 'teacher' and v_role in ('parent', 'student') then
      select array_agg(distinct v.sid) into v_candidates from public.get_visible_student_ids() v(sid)
      where portal_security.teacher_member(v_target, v.sid);
      if coalesce(cardinality(v_candidates), 0) = 0 then
        perform portal_security.fail('invalid_recipient', '42501', 'Cet enseignant n’enseigne pas à vos apprenants.');
      end if;
      select array_agg(p.id) into v_recipients from public.profiles p where p.linked_teacher_id = v_target and p.role = 'teacher';
      v_to_name := (select t.full_name from public.teachers t where t.id = v_target);
    elsif v_kind in ('parent', 'learner') and v_role = 'teacher' then
      if not portal_security.teacher_sees(v_target, null) then
        perform portal_security.fail('not_linked', '42501', 'Cet apprenant n’est pas dans vos groupes.');
      end if;
      v_student := v_target;
      select array_agg(fl.profile_id order by fl.profile_id) into v_recipients from public.family_links fl
      join public.profiles p on p.id = fl.profile_id
      where fl.student_id = v_target and fl.status = 'active'
        and fl.relation = case v_kind when 'parent' then 'parent' else 'self' end
        and p.role = case v_kind when 'parent' then 'parent' else 'student' end;
      v_to_name := (select case v_kind when 'parent' then 'Parent de ' || s.full_name else s.full_name end
        from public.students s where s.id = v_target);
    else
      perform portal_security.fail('invalid_recipient', '22023', 'Destinataire inconnu.');
    end if;
    -- A family sender names the learner the message is about.
    if v_role in ('parent', 'student') then
      if p_student_id is not null then
        if not p_student_id = any(coalesce(v_candidates, '{}'::uuid[])) then
          perform portal_security.fail('not_linked', '42501', 'Cet apprenant n’est pas lié à votre compte.');
        end if;
        v_student := p_student_id;
      elsif coalesce(cardinality(v_candidates), 0) = 1 then
        v_student := v_candidates[1];
      else
        perform portal_security.fail('student_required', '22023', 'Choisissez l’apprenant concerné.');
      end if;
    end if;
  end if;
  if coalesce(cardinality(v_recipients), 0) = 0 then
    perform portal_security.fail('no_linked_account', '42501', 'Ce destinataire n’a pas de compte : message impossible.');
  end if;

  v_from_name := case v_role
    when 'teacher' then (select t.full_name from public.teachers t where t.id = v_teacher)
    when 'parent' then 'Parent de ' || (select portal_security.first_name(s.full_name) from public.students s where s.id = v_student)
    else (select s.full_name from public.students s where s.id = v_student) end;
  foreach rid in array v_recipients loop
    insert into public.messages(from_user_email, from_name, to_user_email, to_name, subject, body, type, student_id, read, reply_to_id)
    values (v_me.email, coalesce(v_from_name, 'English Hills'), (select p.email from public.profiles p where p.id = rid),
      v_to_name, v_subject, v_body, 'message', v_student, false, p_reply_to_id)
    returning id into v_id;
    if (select m.recipient_profile_id from public.messages m where m.id = v_id) is distinct from rid then
      perform portal_security.fail('no_linked_account', '42501', 'Ce destinataire n’a pas de compte lié : message impossible.');
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

create function public.portal_my_messages(p_box text, p_before timestamptz default null)
returns table(id uuid, created_at timestamptz, subject text, body text, read boolean, counterpart text,
  reply_to_id uuid, student_id uuid, can_reply boolean)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
#variable_conflict use_column
begin
  if public.get_my_role() is null or public.get_my_role() not in ('teacher', 'parent', 'student') then
    perform portal_security.fail('forbidden', '42501', 'Messagerie réservée aux espaces enseignant et famille.');
  end if;
  if p_box is null or p_box not in ('inbox', 'sent') then
    perform portal_security.fail('invalid_box', '22023', 'Boîte inconnue.');
  end if;
  return query
  select m.id, m.created_at, m.subject, m.body, m.read,
    case when p_box = 'inbox' then coalesce(m.from_name, 'English Hills') else coalesce(m.to_name, 'Destinataire') end,
    m.reply_to_id, m.student_id, p_box = 'inbox' and m.sender_profile_id is not null
  from public.messages m
  where (case when p_box = 'inbox' then m.recipient_profile_id else m.sender_profile_id end) = auth.uid()
    and portal_security.caller_sees_row(m.student_id)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc, m.id desc
  limit 100;
end $$;

CREATE OR REPLACE FUNCTION public.can_message_recipient(p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  with actor as (
    select p.role, p.email
    from public.profiles p where p.id = auth.uid()
  ), target as (
    select pg_catalog.lower(pg_catalog.btrim(p_email)) as email
  ), students_for_actor as (
    select s.id from public.students s, actor a
    where a.role in ('parent','student') and s.id in (select public.get_visible_student_ids())
  ), student_groups as (
    select g.id as group_id from public.groups g
    where exists (select 1 from students_for_actor sa where academic_security.is_group_member(sa.id, g.id))
  )
  select exists (
    select 1 from actor a, target t
    where a.role in ('director','admin','teacher','parent','student')
      and t.email <> '' and t.email is not null
      and (
        (a.role in ('director','admin') and (
          exists(select 1 from public.profiles p where p.role <> 'pending' and pg_catalog.lower(p.email) = t.email)
          or exists(select 1 from public.students s where pg_catalog.lower(s.email) = t.email or pg_catalog.lower(s.parent_email) = t.email)
          or exists(select 1 from public.teachers x where pg_catalog.lower(x.email) = t.email)
        ))
        or exists(select 1 from public.profiles p where p.role in ('director','admin') and pg_catalog.lower(p.email) = t.email)
        or (a.role in ('parent','student') and exists (
          select 1 from public.groups g join public.teachers x on x.id = g.teacher_id
          where g.id in (select group_id from student_groups) and pg_catalog.lower(x.email) = t.email
        ))
        or (a.role = 'teacher' and exists (
          select 1 from public.students s where portal_security.teacher_sees(s.id, null)
            and (pg_catalog.lower(s.email) = t.email or pg_catalog.lower(s.parent_email) = t.email)
        ))
      )
  );
$function$;

-- Families lose the directory; a teacher reads only the own row.
CREATE OR REPLACE FUNCTION public.get_teacher_directory(p_teacher_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, full_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare v_role text := public.get_my_role(); begin
  if auth.uid() is null or (v_role in ('teacher','admin','director','receptionist')) is not true then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  return query select t.id,t.full_name,t.email from public.teachers t
    where t.deleted_at is null and (p_teacher_id is null or t.id=p_teacher_id)
      and (v_role <> 'teacher' or t.id = public.get_my_teacher_id());
end $function$;

-- ── Storage: link test for families, D4 for teachers ─────────────────────
CREATE OR REPLACE FUNCTION public.resolve_storage_asset(p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare a public.storage_assets; allowed boolean; caller_role text; begin
 select p.role into caller_role from public.profiles p where p.id=auth.uid();
 select * into a from public.storage_assets where id=p_asset_id;
 if auth.uid() is null or a.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if a.state='staff_only' then
   allowed:=a.purpose='legacy_unclassified' and caller_role in ('admin','director')
     and not exists(select 1 from public.storage_asset_bindings b where b.asset_id=a.id);
 elsif a.state='active' and a.purpose in ('student_photo','teacher_photo','portfolio','enrollment_document','premium_homework') then
   select exists(select 1 from public.storage_asset_bindings b
     left join public.students s on s.id=a.student_id
     left join public.portfolios pf on pf.id=b.portfolio_id
     left join public.premium_homework_submissions ph on ph.id=b.premium_submission_id
     left join public.premium_sessions ps on ps.id=ph.premium_session_id
     where b.asset_id=a.id and (
       caller_role in ('admin','director') or
       (caller_role='receptionist' and a.purpose in ('student_photo','enrollment_document','teacher_photo')
         and (a.purpose='teacher_photo' and exists(select 1 from public.teachers t
           where t.id=a.teacher_id and t.deleted_at is null) or
           a.purpose in ('student_photo','enrollment_document') and s.deleted_at is null
             and (a.purpose='student_photo' and b.student_photo_id=s.id or
               a.purpose='enrollment_document' and b.enrollment_id=a.enrollment_id
                 and exists(select 1 from public.enrollments e where e.id=a.enrollment_id and e.student_id=s.id)))) or
       (a.purpose in ('student_photo','portfolio') and s.deleted_at is null and (
         (caller_role='parent' and portal_security.family_linked(auth.uid(), s.id) and (a.purpose='student_photo' or pf.visible_to_parent is true)) or
         (caller_role='student' and portal_security.family_linked(auth.uid(), s.id) and (a.purpose='student_photo' or pf.visible_to_student is true)) or
         (caller_role='teacher' and portal_security.teacher_sees(s.id, null))
       )) or
       (a.purpose='premium_homework' and ph.id is not null and (
         (caller_role in ('parent','student') and portal_security.family_linked(auth.uid(), s.id)) or
         (caller_role='teacher' and ps.teacher_id=public.get_my_teacher_id())
       ))
     )) into allowed;
 else allowed:=false;
 end if;
 if allowed is not true or not exists(
   select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path and o.version=a.object_version
 ) then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object('bucket',a.bucket_id,'path',a.object_path);
end $function$;

CREATE OR REPLACE FUNCTION storage_security.can_write(actor uuid, purpose text, sid uuid, tid uuid, eid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 select actor is not null and exists (
   select 1 from public.profiles p where p.id=actor and (
     (p.role in ('admin','director') and purpose in ('student_photo','teacher_photo','portfolio','enrollment_document','premium_homework'))
     or (p.role='receptionist' and purpose in ('student_photo','enrollment_document')
       and sid is not null and (purpose='student_photo' and eid is null or
         purpose='enrollment_document' and eid is not null))
     or (purpose='portfolio' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null and (
       (p.role='student' and portal_security.family_linked(p.id, s.id)) or
       (p.role='teacher' and portal_security.teacher_member(p.linked_teacher_id, s.id)))))
     or (purpose='premium_homework' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null
       and s.plan_type='Premium' and p.role in ('student','parent') and portal_security.family_linked(p.id, s.id)))
   )
 ) and (sid is null or exists(select 1 from public.students where id=sid and deleted_at is null))
 and (tid is null or exists(select 1 from public.teachers where id=tid and deleted_at is null))
 and (eid is null or exists(select 1 from public.enrollments where id=eid and student_id=sid))
$function$;

-- ── D11: signed-in-only policies require a real role ─────────────────────
drop policy "groups read all auth" on public.groups;
create policy "groups read all auth" on public.groups for select to authenticated
  using (auth.uid() is not null and coalesce(get_my_role(), 'pending') <> 'pending');
drop policy "appconfig auth read" on public.app_config;
create policy "appconfig auth read" on public.app_config for select to authenticated
  using (auth.uid() is not null and coalesce(get_my_role(), 'pending') <> 'pending');
drop policy "announcements audience read" on public.announcements;
create policy "announcements audience read" on public.announcements for select
  using (
    auth.uid() is not null
    and coalesce(get_my_role(), 'pending') <> 'pending'
    and (
      audience = 'all'
      or (audience = 'parents'  and get_my_role() = 'parent')
      or (audience = 'teachers' and get_my_role() = 'teacher')
      or (
        audience = 'group'
        and group_id in (
          select g.id from public.groups g
          where (get_my_role() = 'teacher' and g.teacher_id = get_my_teacher_id())
             or (get_my_role() in ('parent', 'student') and g.id in (select public.my_member_group_ids()))
        )
      )
    )
  );

-- ── R0 readiness: closed labels, none = ready for the first invitation ───
create function portal_security.readiness_failures() returns text[]
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select array_remove(array[
    case when exists (select 1 from public.premium_groups) or exists (select 1 from public.premium_group_memberships)
      or exists (select 1 from public.premium_sessions) or exists (select 1 from public.premium_attendance)
      or exists (select 1 from public.premium_homework_submissions)
      then 'premium tables are not empty' end,
    case when portal_security.office_profile() is null then 'office recipient is not configured' end,
    case when exists (select 1 from public.students s where s.deleted_at is null and nullif(btrim(s.email), '') is not null
        group by lower(btrim(s.email)) having count(*) > 10)
      then 'an address is on more than 10 learner files' end,
    case when exists (select 1 from pg_constraint c where c.conname in ('students_email_normalized',
        'students_parent_email_normalized', 'teachers_email_normalized') and not c.convalidated)
      then 'e-mail normalisation constraints are not validated' end], null)
$$;

-- ── D12: function grants ─────────────────────────────────────────────────
revoke execute on function public.get_my_email() from public, anon;
revoke execute on function public.get_my_role() from public, anon;
revoke execute on function public.get_my_student_id() from public, anon;
revoke execute on function public.get_my_teacher_id() from public, anon;
revoke execute on function public.get_visible_student_ids() from public, anon;
revoke execute on function public.mark_my_notifications_read() from public, anon;
grant execute on function public.get_my_email() to authenticated;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.get_my_student_id() to authenticated;
grant execute on function public.get_my_teacher_id() to authenticated;
grant execute on function public.get_visible_student_ids() to authenticated;
grant execute on function public.mark_my_notifications_read() to authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_new_receipt() from public, anon, authenticated;
revoke execute on function public.log_activity() from public, anon, authenticated;
revoke execute on function public.notify_premium_homework_teacher() from public, anon, authenticated;
revoke execute on function public.sync_premium_membership_entitlement() from public, anon, authenticated;

-- New private functions: no API role; new portal functions: authenticated only.
revoke all on all functions in schema portal_security from public, anon, authenticated, service_role;
do $$ declare f text; begin
  foreach f in array array[
    'public.portal_teacher_roster(uuid)', 'public.portal_my_learners()', 'public.portal_learner_record(uuid)',
    'public.portal_request_reenrollment(uuid)', 'public.portal_message_recipients()',
    'public.portal_send_message(text,text,text,uuid,uuid)', 'public.portal_my_messages(text,timestamptz)',
    'public.preview_family_invitation(text,text)', 'public.prepare_family_invitation(text,text,uuid[])',
    'public.prepare_teacher_invitation(text,uuid)', 'public.link_family_student(uuid,uuid)',
    'public.link_teacher_account(uuid,uuid)', 'public.revoke_family_link(uuid,text)',
    'public.list_family_links(uuid)'] loop
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

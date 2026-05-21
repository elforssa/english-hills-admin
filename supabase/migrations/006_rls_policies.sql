-- =============================================================================
-- 006 — Row-Level Security policies for all 22 tables
--
-- Specified as 002_rls_policies.sql per migration request, renumbered to 006
-- because 002–005 are already on remote. To "restore" canonical numbering you
-- would need to `supabase db reset` and re-push 001 + this file as 002 — that
-- destroys all data, so leaving it at 006 is the safe default.
--
-- Roles (stored in public.profiles.role):
--   admin · director · teacher · parent · student · receptionist · pending
--
-- After this migration runs, every public table requires a matching policy
-- for the calling role. Anonymous (auth.uid() IS NULL) is denied by default;
-- the only carve-outs are noted with `anon` in the policy name (e.g. public
-- enrollment, public messages from the system trigger).
-- =============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PART 1 · Helper functions
-- ────────────────────────────────────────────────────────────────────────────

-- get_my_role() — current user's role, or NULL if not signed in / no profile.
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- get_my_student_id() — student row this user is linked to (parent, student).
create or replace function public.get_my_student_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select linked_student_id from public.profiles where id = auth.uid()
$$;

-- get_my_teacher_id() — teacher row this user is linked to (teacher role).
-- Not in original spec but required by every teacher-scoped policy below.
create or replace function public.get_my_teacher_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select linked_teacher_id from public.profiles where id = auth.uid()
$$;

-- get_my_email() — current user's email from profiles. Used by message and
-- notification policies that scope rows by recipient_email.
create or replace function public.get_my_email()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select email from public.profiles where id = auth.uid()
$$;

grant execute on function public.get_my_role()       to authenticated, anon;
grant execute on function public.get_my_student_id() to authenticated, anon;
grant execute on function public.get_my_teacher_id() to authenticated, anon;
grant execute on function public.get_my_email()      to authenticated, anon;


-- get_visible_student_ids() — set of student rows the caller can see in
-- their parent/student role. Supports multi-child parents: matches by
-- students.parent_email for parents (one parent profile → many child rows)
-- and by students.email for students (typically one row per student).
-- Used in place of `student_id in (select public.get_visible_student_ids())` across all
-- parent/student-scoped policies.
create or replace function public.get_visible_student_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.students
  where (public.get_my_role() = 'parent'  and parent_email = public.get_my_email())
     or (public.get_my_role() = 'student' and email        = public.get_my_email())
$$;

grant execute on function public.get_visible_student_ids() to authenticated;


-- apply_pending_role() — looks up a row in pending_roles matching the
-- caller's email, applies it to their profile, and deletes the row.
-- Needed because the pending_roles policies below block all non-admin reads;
-- this lets the AuthContext sweep work via RPC instead.
--
-- Usage from the client:
--   const { data, error } = await supabase.rpc('apply_pending_role')
create or replace function public.apply_pending_role()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  my_email text;
  pending_row record;
begin
  my_email := (select email from public.profiles where id = auth.uid());
  if my_email is null then
    return null;
  end if;

  select id, role into pending_row
    from public.pending_roles
   where email = my_email
   limit 1;

  if pending_row.id is null then
    return null;
  end if;

  update public.profiles
     set role = pending_row.role
   where id = auth.uid();

  delete from public.pending_roles where id = pending_row.id;

  return pending_row.role;
end;
$$;

grant execute on function public.apply_pending_role() to authenticated;


-- claim_director_if_none() — first signed-in user can self-promote when no
-- director exists. Works around the self-elevation trigger below; succeeds
-- exactly once across the system. Mirrors the "Devenir Directeur" button.
create or replace function public.claim_director_if_none()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  if exists (select 1 from public.profiles where role = 'director') then
    return false;
  end if;
  update public.profiles set role = 'director' where id = auth.uid();
  return true;
end;
$$;

grant execute on function public.claim_director_if_none() to authenticated;


-- simulate_role(target_role) — directors can temporarily switch their own
-- role to test other portals. Also succeeds when no OTHER director exists
-- (covers the "switch back" flow: after a director simulates a non-director
-- role, their DB role is no longer 'director'; this lets them keep simulating
-- — and ultimately switch back to director — as long as they remain the
-- only would-be director in the system).
create or replace function public.simulate_role(target_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role        text;     -- avoid pg reserved keyword `current_role`
  has_other_director boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  if target_role not in (
    'admin','director','teacher','parent','student','receptionist','pending'
  ) then
    return false;
  end if;

  caller_role := (select role from public.profiles where id = auth.uid());
  has_other_director := exists (
    select 1 from public.profiles
     where role = 'director' and id <> auth.uid()
  );

  -- Allowed iff: caller is currently director, OR no other director exists.
  if caller_role <> 'director' and has_other_director then
    return false;
  end if;

  update public.profiles set role = target_role where id = auth.uid();
  return true;
end;
$$;

grant execute on function public.simulate_role(text) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- PART 2 · profiles self-elevation guard
--
-- Prevents non-admin users from changing role / linked_student_id /
-- linked_teacher_id on their own profile via direct UPDATE. Admin/director
-- bypass this check. Bootstrap (claim_director_if_none) bypasses via
-- SECURITY DEFINER.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.profiles_prevent_self_elevation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() in ('admin', 'director') then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'profiles.role can only be changed by admin or director (use claim_director_if_none() for bootstrap)';
  end if;
  if new.linked_student_id is distinct from old.linked_student_id then
    raise exception 'profiles.linked_student_id can only be changed by admin or director';
  end if;
  if new.linked_teacher_id is distinct from old.linked_teacher_id then
    raise exception 'profiles.linked_teacher_id can only be changed by admin or director';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_self_elevation_t on public.profiles;
create trigger profiles_prevent_self_elevation_t
  before update on public.profiles
  for each row
  execute function public.profiles_prevent_self_elevation();


-- ────────────────────────────────────────────────────────────────────────────
-- PART 3 · Enable RLS on every table (22 entities)
-- ────────────────────────────────────────────────────────────────────────────

alter table public.profiles             enable row level security;
alter table public.teachers             enable row level security;
alter table public.groups               enable row level security;
alter table public.students             enable row level security;
alter table public.authorized_adults    enable row level security;
alter table public.receipts             enable row level security;
alter table public.payments             enable row level security;
alter table public.enrollments          enable row level security;
alter table public.attendance           enable row level security;
alter table public.assessments          enable row level security;
alter table public.learning_assessments enable row level security;
alter table public.placement_tests      enable row level security;
alter table public.portfolios           enable row level security;
alter table public.certificates         enable row level security;
alter table public.dismissal_logs       enable row level security;
alter table public.payroll              enable row level security;
alter table public.leave_requests       enable row level security;
alter table public.announcements        enable row level security;
alter table public.notifications        enable row level security;
alter table public.messages             enable row level security;
alter table public.app_config           enable row level security;
alter table public.pending_roles        enable row level security;


-- ────────────────────────────────────────────────────────────────────────────
-- PART 4 · Per-table policies
--
-- Policies are PERMISSIVE (the default) — multiple policies on a table OR
-- together. Each block drops-if-exists before create so the migration is
-- re-runnable on a fresh state.
-- ────────────────────────────────────────────────────────────────────────────


-- ─── profiles ───────────────────────────────────────────────────────────────
-- Users read+update their own row. Admin/director: full.
drop policy if exists "profiles select"  on public.profiles;
drop policy if exists "profiles insert"  on public.profiles;
drop policy if exists "profiles update"  on public.profiles;
drop policy if exists "profiles delete"  on public.profiles;

create policy "profiles select" on public.profiles for select
  using (id = auth.uid() or get_my_role() in ('admin','director'));

-- INSERT is handled by the auth.users trigger (SECURITY DEFINER, bypasses RLS).
-- Direct inserts are admin/director only.
create policy "profiles insert" on public.profiles for insert
  with check (get_my_role() in ('admin','director'));

create policy "profiles update" on public.profiles for update
  using (id = auth.uid() or get_my_role() in ('admin','director'))
  with check (id = auth.uid() or get_my_role() in ('admin','director'));

create policy "profiles delete" on public.profiles for delete
  using (get_my_role() in ('admin','director'));


-- ─── teachers ──────────────────────────────────────────────────────────────
-- admin/director: full. teacher: read all, update own row. all others: read.
drop policy if exists "teachers admin all"     on public.teachers;
drop policy if exists "teachers read all auth" on public.teachers;
drop policy if exists "teachers self update"   on public.teachers;

create policy "teachers admin all" on public.teachers for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "teachers read all auth" on public.teachers for select
  using (auth.uid() is not null);

create policy "teachers self update" on public.teachers for update
  using (get_my_role() = 'teacher' and id = get_my_teacher_id())
  with check (get_my_role() = 'teacher' and id = get_my_teacher_id());


-- ─── groups ─────────────────────────────────────────────────────────────────
-- admin/director: full. all authenticated: read.
drop policy if exists "groups admin all"     on public.groups;
drop policy if exists "groups read all auth" on public.groups;

create policy "groups admin all" on public.groups for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "groups read all auth" on public.groups for select
  using (auth.uid() is not null);


-- ─── students ──────────────────────────────────────────────────────────────
-- admin/director: full. teacher: read students in their groups. parent/student:
-- read own. receptionist: read all (no write). anon: insert Prospect for
-- /inscription public form.
drop policy if exists "students admin all"             on public.students;
drop policy if exists "students teacher read groups"   on public.students;
drop policy if exists "students parent read self"      on public.students;
drop policy if exists "students student read self"     on public.students;
drop policy if exists "students receptionist read"     on public.students;
drop policy if exists "students anon insert prospect"  on public.students;

create policy "students admin all" on public.students for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "students teacher read groups" on public.students for select
  using (
    get_my_role() = 'teacher'
    and groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
  );

create policy "students parent read self" on public.students for select
  using (get_my_role() = 'parent' and id in (select public.get_visible_student_ids()));

create policy "students student read self" on public.students for select
  using (get_my_role() = 'student' and id in (select public.get_visible_student_ids()));

create policy "students receptionist read" on public.students for select
  using (get_my_role() = 'receptionist');

-- Public enrollment form: anon can insert Prospects only.
create policy "students anon insert prospect" on public.students for insert
  with check (auth.uid() is null and status = 'Prospect');


-- ─── authorized_adults ─────────────────────────────────────────────────────
-- admin/director/receptionist: full. parent: read own child's rows.
drop policy if exists "authadults staff all"   on public.authorized_adults;
drop policy if exists "authadults parent read" on public.authorized_adults;

create policy "authadults staff all" on public.authorized_adults for all
  using (get_my_role() in ('admin','director','receptionist'))
  with check (get_my_role() in ('admin','director','receptionist'));

create policy "authadults parent read" on public.authorized_adults for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));


-- ─── receipts ───────────────────────────────────────────────────────────────
-- admin/director: full. parent: read own child's rows. all others: no access.
drop policy if exists "receipts admin all"   on public.receipts;
drop policy if exists "receipts parent read" on public.receipts;

create policy "receipts admin all" on public.receipts for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "receipts parent read" on public.receipts for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));


-- ─── payments ───────────────────────────────────────────────────────────────
-- admin/director: full. parent: read own child's. all others: no access.
drop policy if exists "payments admin all"   on public.payments;
drop policy if exists "payments parent read" on public.payments;

create policy "payments admin all" on public.payments for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "payments parent read" on public.payments for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));


-- ─── enrollments ────────────────────────────────────────────────────────────
-- admin/director: full. teacher: read for their groups. parent: rw own child.
-- receptionist: full read + insert. anon: insert Submitted for /inscription.
drop policy if exists "enrollments admin all"          on public.enrollments;
drop policy if exists "enrollments teacher read"       on public.enrollments;
drop policy if exists "enrollments parent select"      on public.enrollments;
drop policy if exists "enrollments parent insert"      on public.enrollments;
drop policy if exists "enrollments parent update"      on public.enrollments;
drop policy if exists "enrollments parent delete"      on public.enrollments;
drop policy if exists "enrollments recep select"       on public.enrollments;
drop policy if exists "enrollments recep insert"       on public.enrollments;
drop policy if exists "enrollments anon insert"        on public.enrollments;

create policy "enrollments admin all" on public.enrollments for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "enrollments teacher read" on public.enrollments for select
  using (
    get_my_role() = 'teacher'
    and group_id in (select id from public.groups where teacher_id = get_my_teacher_id())
  );

create policy "enrollments parent select" on public.enrollments for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create policy "enrollments parent insert" on public.enrollments for insert
  with check (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create policy "enrollments parent update" on public.enrollments for update
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()))
  with check (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create policy "enrollments parent delete" on public.enrollments for delete
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create policy "enrollments recep select" on public.enrollments for select
  using (get_my_role() = 'receptionist');

create policy "enrollments recep insert" on public.enrollments for insert
  with check (get_my_role() = 'receptionist');

-- Public enrollment form: anon can insert Submitted only.
create policy "enrollments anon insert" on public.enrollments for insert
  with check (auth.uid() is null and status = 'Submitted');


-- ─── attendance ─────────────────────────────────────────────────────────────
-- admin/director: full. teacher: rw groups assigned to them. parent: read own
-- child. student: read own.
-- (Spec didn't list receptionist for attendance — they cannot access this
-- table even though the sidebar nav points them at /attendance.)
drop policy if exists "attendance admin all"          on public.attendance;
drop policy if exists "attendance teacher select"     on public.attendance;
drop policy if exists "attendance teacher insert"     on public.attendance;
drop policy if exists "attendance teacher update"     on public.attendance;
drop policy if exists "attendance teacher delete"     on public.attendance;
drop policy if exists "attendance parent read"        on public.attendance;
drop policy if exists "attendance student read"       on public.attendance;
drop policy if exists "attendance recep read"         on public.attendance;

create policy "attendance admin all" on public.attendance for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "attendance teacher select" on public.attendance for select
  using (
    get_my_role() = 'teacher'
    and group_id in (select id from public.groups where teacher_id = get_my_teacher_id())
  );
create policy "attendance teacher insert" on public.attendance for insert
  with check (
    get_my_role() = 'teacher'
    and group_id in (select id from public.groups where teacher_id = get_my_teacher_id())
  );
create policy "attendance teacher update" on public.attendance for update
  using (
    get_my_role() = 'teacher'
    and group_id in (select id from public.groups where teacher_id = get_my_teacher_id())
  )
  with check (
    get_my_role() = 'teacher'
    and group_id in (select id from public.groups where teacher_id = get_my_teacher_id())
  );
create policy "attendance teacher delete" on public.attendance for delete
  using (
    get_my_role() = 'teacher'
    and group_id in (select id from public.groups where teacher_id = get_my_teacher_id())
  );

create policy "attendance parent read" on public.attendance for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create policy "attendance student read" on public.attendance for select
  using (get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));

-- Receptionist read access — front desk needs to see attendance.
create policy "attendance recep read" on public.attendance for select
  using (get_my_role() = 'receptionist');


-- ─── assessments ───────────────────────────────────────────────────────────
-- admin/director: full. teacher: rw own students. parent/student: read own.
drop policy if exists "assessments admin all"      on public.assessments;
drop policy if exists "assessments teacher rw"     on public.assessments;
drop policy if exists "assessments parent read"    on public.assessments;
drop policy if exists "assessments student read"   on public.assessments;

create policy "assessments admin all" on public.assessments for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "assessments teacher rw" on public.assessments for all
  using (
    get_my_role() = 'teacher'
    and student_id in (
      select id from public.students
      where groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
    )
  )
  with check (
    get_my_role() = 'teacher'
    and student_id in (
      select id from public.students
      where groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
    )
  );

create policy "assessments parent read" on public.assessments for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create policy "assessments student read" on public.assessments for select
  using (get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));


-- ─── learning_assessments ──────────────────────────────────────────────────
drop policy if exists "learnassess admin all"     on public.learning_assessments;
drop policy if exists "learnassess teacher rw"    on public.learning_assessments;
drop policy if exists "learnassess parent read"   on public.learning_assessments;
drop policy if exists "learnassess student read"  on public.learning_assessments;

create policy "learnassess admin all" on public.learning_assessments for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "learnassess teacher rw" on public.learning_assessments for all
  using (
    get_my_role() = 'teacher'
    and student_id in (
      select id from public.students
      where groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
    )
  )
  with check (
    get_my_role() = 'teacher'
    and student_id in (
      select id from public.students
      where groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
    )
  );

create policy "learnassess parent read" on public.learning_assessments for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create policy "learnassess student read" on public.learning_assessments for select
  using (get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));


-- ─── placement_tests ───────────────────────────────────────────────────────
drop policy if exists "placement admin all"     on public.placement_tests;
drop policy if exists "placement teacher rw"    on public.placement_tests;
drop policy if exists "placement parent read"   on public.placement_tests;
drop policy if exists "placement student read"  on public.placement_tests;

create policy "placement admin all" on public.placement_tests for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "placement teacher rw" on public.placement_tests for all
  using (
    get_my_role() = 'teacher'
    and student_id in (
      select id from public.students
      where groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
    )
  )
  with check (
    get_my_role() = 'teacher'
    and student_id in (
      select id from public.students
      where groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
    )
  );

create policy "placement parent read" on public.placement_tests for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create policy "placement student read" on public.placement_tests for select
  using (get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));


-- ─── portfolios ────────────────────────────────────────────────────────────
-- admin/director: full. teacher: rw own students. parent: read own child
-- (only visible_to_parent rows). student: r/w own (only visible_to_student).
drop policy if exists "portfolios admin all"       on public.portfolios;
drop policy if exists "portfolios teacher rw"      on public.portfolios;
drop policy if exists "portfolios parent read"     on public.portfolios;
drop policy if exists "portfolios student select"  on public.portfolios;
drop policy if exists "portfolios student insert"  on public.portfolios;
drop policy if exists "portfolios student update"  on public.portfolios;
drop policy if exists "portfolios student delete"  on public.portfolios;

create policy "portfolios admin all" on public.portfolios for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "portfolios teacher rw" on public.portfolios for all
  using (
    get_my_role() = 'teacher'
    and student_id in (
      select id from public.students
      where groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
    )
  )
  with check (
    get_my_role() = 'teacher'
    and student_id in (
      select id from public.students
      where groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
    )
  );

create policy "portfolios parent read" on public.portfolios for select
  using (
    get_my_role() = 'parent'
    and student_id in (select public.get_visible_student_ids())
    and visible_to_parent = true
  );

create policy "portfolios student select" on public.portfolios for select
  using (
    get_my_role() = 'student'
    and student_id in (select public.get_visible_student_ids())
    and visible_to_student = true
  );
create policy "portfolios student insert" on public.portfolios for insert
  with check (get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));
create policy "portfolios student update" on public.portfolios for update
  using (get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()))
  with check (get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));
create policy "portfolios student delete" on public.portfolios for delete
  using (get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));


-- ─── certificates ──────────────────────────────────────────────────────────
drop policy if exists "certificates admin all"     on public.certificates;
drop policy if exists "certificates teacher read"  on public.certificates;
drop policy if exists "certificates parent read"   on public.certificates;
drop policy if exists "certificates student read"  on public.certificates;

create policy "certificates admin all" on public.certificates for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "certificates teacher read" on public.certificates for select
  using (
    get_my_role() = 'teacher'
    and student_id in (
      select id from public.students
      where groupe_id in (select id from public.groups where teacher_id = get_my_teacher_id())
    )
  );

create policy "certificates parent read" on public.certificates for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create policy "certificates student read" on public.certificates for select
  using (get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));


-- ─── dismissal_logs ────────────────────────────────────────────────────────
-- admin/director/receptionist: full. parent: read own child's rows.
drop policy if exists "dismissal staff all"    on public.dismissal_logs;
drop policy if exists "dismissal parent read"  on public.dismissal_logs;

create policy "dismissal staff all" on public.dismissal_logs for all
  using (get_my_role() in ('admin','director','receptionist'))
  with check (get_my_role() in ('admin','director','receptionist'));

create policy "dismissal parent read" on public.dismissal_logs for select
  using (get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));


-- ─── payroll ────────────────────────────────────────────────────────────────
-- admin/director: full. teacher: read own row. all others: no access.
drop policy if exists "payroll admin all"     on public.payroll;
drop policy if exists "payroll teacher read"  on public.payroll;

create policy "payroll admin all" on public.payroll for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "payroll teacher read" on public.payroll for select
  using (get_my_role() = 'teacher' and teacher_id = get_my_teacher_id());


-- ─── leave_requests ─────────────────────────────────────────────────────────
-- admin/director: full. teacher: rw own rows only.
drop policy if exists "leave admin all"        on public.leave_requests;
drop policy if exists "leave teacher rw"       on public.leave_requests;

create policy "leave admin all" on public.leave_requests for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "leave teacher rw" on public.leave_requests for all
  using (get_my_role() = 'teacher' and teacher_id = get_my_teacher_id())
  with check (get_my_role() = 'teacher' and teacher_id = get_my_teacher_id());


-- ─── announcements ─────────────────────────────────────────────────────────
-- admin/director: full. all others read rows addressed to them by audience.
drop policy if exists "announcements admin all"       on public.announcements;
drop policy if exists "announcements audience read"   on public.announcements;

create policy "announcements admin all" on public.announcements for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "announcements audience read" on public.announcements for select
  using (
    auth.uid() is not null
    and (
      audience = 'all'
      or (audience = 'parents'  and get_my_role() = 'parent')
      or (audience = 'teachers' and get_my_role() = 'teacher')
      or (
        audience = 'group'
        and group_id in (
          select g.id from public.groups g
          where (get_my_role() = 'teacher' and g.teacher_id = get_my_teacher_id())
             or (get_my_role() in ('parent','student')
                 and g.id = (select groupe_id from public.students where id in (select public.get_visible_student_ids())))
        )
      )
    )
  );


-- ─── notifications ─────────────────────────────────────────────────────────
-- admin/director: full. all others read rows addressed to them by email.
drop policy if exists "notifications admin all"   on public.notifications;
drop policy if exists "notifications self read"   on public.notifications;

create policy "notifications admin all" on public.notifications for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "notifications self read" on public.notifications for select
  using (recipient_email = get_my_email());


-- ─── messages ──────────────────────────────────────────────────────────────
-- admin/director: full. all others: read messages where they're sender or
-- recipient.
drop policy if exists "messages admin all"          on public.messages;
drop policy if exists "messages self read"          on public.messages;
drop policy if exists "messages self insert"        on public.messages;

create policy "messages admin all" on public.messages for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "messages self read" on public.messages for select
  using (
    to_user_email   = get_my_email()
    or from_user_email = get_my_email()
  );

-- Authenticated users can send messages from their own address.
create policy "messages self insert" on public.messages for insert
  with check (from_user_email = get_my_email());


-- ─── app_config ────────────────────────────────────────────────────────────
-- admin/director: full. all signed-in: read only.
drop policy if exists "appconfig admin all"  on public.app_config;
drop policy if exists "appconfig auth read"  on public.app_config;

create policy "appconfig admin all" on public.app_config for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

create policy "appconfig auth read" on public.app_config for select
  using (auth.uid() is not null);


-- ─── pending_roles ─────────────────────────────────────────────────────────
-- admin/director: full. Everyone else: no access (even reads).
-- The AuthContext sweep should call apply_pending_role() RPC instead.
drop policy if exists "pending_roles admin all" on public.pending_roles;

create policy "pending_roles admin all" on public.pending_roles for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

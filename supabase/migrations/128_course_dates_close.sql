-- 128: Courses with dates — close a finished course (plan CDC-r3, ADR-016, approved by the
-- owner on 2026-11-05: Q1 and Q3–Q18 all A, OA1–OA6, and the six reviewer points carried
-- into the implementation record). A group gets a start and an end date; the director
-- closes a finished course explicitly (« Clôturer le cours »), with its paid learners who
-- were never placed; a closed course refuses every placement; « Clôturer l'année »
-- learns about course dates; parents and students read only their own groups. Nothing
-- ends automatically. Forward-only and transactional. No row changes: existing groups
-- keep empty dates. The only object dropped is the read policy « groups read all auth »,
-- replaced by « groups read staff » (the same rule for staff) and « groups read family ».
--
-- 1. D1: public.groups gains date_debut, date_fin, closed_at, closed_by and the check
--    groups_course_dates_order. academic_security.guard_group_year() is re-created from
--    its 125 body with the date window (1 June Y – 31 August Y+1) checked after the year
--    is filled or validated, and groups_year_guard now also fires on the two dates (S5).
-- 2. D1/D4: academic_security.guard_course_group() and trigger groups_course_guard: the
--    dates required for Mise à niveau, Adults, Summer Camp and One-to-One (Q1 = A), no
--    dates on an online group, One-to-One capacity 1 (Q4 = A), logged date edits, the
--    closed mark written only under eh.course_command, and the frozen fields of a closed
--    group.
-- 3. D4: academic_security.guard_course_placement() and trigger enrollment_course_guard:
--    a row entering a group share-locks the group row first, then refuses a closed
--    in-person course, a closed online course (share-locking the online course row, S3)
--    and an undated short-programme group. academic_security.enforce_group_capacity() is
--    re-created from its 120 body with only `for share` on its group read (N-1), so the
--    group row is always locked before the seat lock.
-- 4. D3/D10: maintenance.course_close_journal (RLS on, no API grant).
-- 5. D2/D3/D5: the director commands list_courses_to_close, close_course_preview,
--    close_course, reopen_course and close_school_year_preview; close_school_year is
--    re-created from its 120 body (D5, OA4, OA6, Q16, Q18, N-3).
-- 6. D1/D4: save_receptionist_group (125 body plus the two date keys) and
--    crm_enrollment_groups (125 body without closed courses).
-- 7. D6 (OA3): public.family_group_ids() and the two read policies. The plan names the
--    helper portal_security.family_group_ids(); authenticated has no USAGE on any
--    *_security schema and every existing policy helper lives in public (as
--    get_visible_student_ids), so the helper is created in public (implementation record).
-- The one-time step is supabase/manual/course_close_backlog.sql (separately approved),
-- its revert supabase/manual/course_close_backlog_revert.sql; the restore is
-- scripts/rollback/128_course_dates_close_restore.sql (not run without its own approval).
begin;

-- ── 1. Columns (D1) ───────────────────────────────────────────────────────────
alter table public.groups
  add column date_debut date,
  add column date_fin date,
  add column closed_at timestamptz,
  add column closed_by uuid,
  add constraint groups_course_dates_order check (date_debut is null or date_fin is null or date_fin >= date_debut);

-- ── 2. Journal (D3, D10): ids, statuses, groups, years and charge ids only ─────
create table maintenance.course_close_journal (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  source text not null check (source in ('close_course','close_school_year','reopen_course','backlog_step','backlog_revert')),
  action text not null check (action in ('run','ended','attached','ended_unplaced','resynced','charge_linked',
    'reopened','restored','skipped','reverted')),
  entity text not null check (entity in ('runs','groups','enrollments','students','charges')),
  row_id uuid not null,
  group_id uuid,
  before jsonb,
  after jsonb,
  reverts_id bigint references maintenance.course_close_journal(id),
  actor uuid,
  at timestamptz not null default now()
);
create index course_close_journal_run on maintenance.course_close_journal (run_id, action);
create index course_close_journal_row on maintenance.course_close_journal (row_id, action);
create index course_close_journal_group on maintenance.course_close_journal (group_id, id) where action = 'run';
alter table maintenance.course_close_journal enable row level security;
revoke all on table maintenance.course_close_journal from public, anon, authenticated, service_role;

-- ── 3. Shared rules ────────────────────────────────────────────────────────────
-- Q1 = A: the programmes whose groups must carry dates.
create function academic_security.course_dates_required(p_session text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(p_session in ('Mise à niveau', 'Adults', 'Summer Camp', 'One-to-One'), false)
$$;

-- A course of one (capacity 1) belongs to its own learner: it never matches another
-- learner's paid enrollment without a group (reviewer point, One-to-One).
create function academic_security.course_of_one_allows(p_group uuid, p_capacity integer, p_student uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce(p_capacity, 0) <> 1 or exists (select 1 from public.enrollments x
    where x.student_id = p_student and (x.group_id = p_group or x.ended_group_id = p_group))
$$;

-- B1: the paid enrollments without a group that match an in-person course: Confirmed,
-- no group, the course's programme and school year, no level or the course's level, the
-- learner file not archived, and never another learner's course of one.
create function academic_security.course_unplaced(p_group uuid) returns setof public.enrollments
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select e.* from public.groups g
  join public.enrollments e on e.status = 'Confirmed' and e.group_id is null
    and e.session_type = g.session_type and e.school_year = academic_security.school_year_of(g.annee)
    and (e.level is null or e.level = g.niveau)
  join public.students s on s.id = e.student_id and s.deleted_at is null
  where g.id = p_group and not online_security.is_online_type(g.session_type)
    and academic_security.course_of_one_allows(g.id, g.capacite_max, e.student_id)
$$;

-- S6, N-2: the charges linked to an enrollment before it ends: open, partly paid,
-- unlinked tuition charges of its learner, programme and school year; an undated charge
-- (before 057) only when the enrollment's year is the current one and the charge was
-- created during it. « Engagements » (nothing paid) are never linked.
create function academic_security.course_link_charges(p_enrollment uuid)
returns table (charge_id uuid, balance numeric)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select b.id, b.balance from public.enrollments e
  join public.charge_balances b on b.student_id = e.student_id
  where e.id = p_enrollment and b.enrollment_id is null and b.voided_at is null and not b.legacy
    and b.session_type = e.session_type and b.balance > 0 and b.paid_amount > 0
    and (b.school_year = e.school_year
      or (b.school_year is null and e.school_year = public.centre_school_year()
        and public.centre_school_year(public.business_date(b.created_at)) = e.school_year))
$$;

create function academic_security.course_engagements(p_enrollment uuid)
returns table (charge_id uuid, balance numeric)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select b.id, b.balance from public.enrollments e
  join public.charge_balances b on b.student_id = e.student_id
  where e.id = p_enrollment and b.enrollment_id is null and b.voided_at is null and not b.legacy
    and b.session_type = e.session_type and b.balance > 0 and b.paid_amount = 0
    and (b.school_year = e.school_year or b.school_year is null)
$$;

-- Reviewer point (next-session deposits): live receipts on an enrollment that ends,
-- whose charge was created after the course's end date. A payment made after the end
-- on a new charge can only be a deposit for a later session that the payment matched
-- to the still-live enrollment; once that enrollment ends the learner needs
-- « Rouvrir l'inscription ». Old balances on charges created before the end are not flagged.
create function academic_security.course_late_deposits(p_enrollment uuid, p_date_fin date)
returns table (receipt_id uuid, amount numeric)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select r.id, r.montant_paye from public.receipts r
  join public.charges c on c.id = r.charge_id
  where p_date_fin is not null and r.voided_at is null and r.deleted_at is null and c.voided_at is null
    and (c.enrollment_id = p_enrollment or r.enrollment_id = p_enrollment)
    and public.business_date(c.created_at) > p_date_fin
$$;

-- The latest run of a closed course, returned again for a repeated close (replay).
create function academic_security.course_close_replay(p_group uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select j.after from maintenance.course_close_journal j
      where j.group_id = p_group and j.action = 'run' and j.source in ('close_course', 'close_school_year')
        and j.after is not null order by j.id desc limit 1), jsonb_build_object('group_id', p_group))
    || jsonb_build_object('replayed', true, 'closed_at', (select g.closed_at from public.groups g where g.id = p_group))
$$;

-- D5 (OA4, OA6, Q18 = A): what « Clôturer l'année » does with each live enrollment of
-- the year. 'kept_later': its course ends after today. 'kept_waiting': Confirmed without
-- a group in a programme whose courses carry dates, and a matching course has not ended
-- or none exists yet. 'end': everything else, as before 128.
create function academic_security.year_close_rows(p_school_year text)
returns table (enrollment_id uuid, student_id uuid, session_type text, group_id uuid, outcome text)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  with courses as (
    select g.id, g.session_type, g.niveau, academic_security.school_year_of(g.annee) as yr,
      case when online_security.is_online_type(g.session_type)
        then coalesce(c.capacity, case when g.session_type = 'Online One-to-One' then 1 end) else g.capacite_max end as capacity,
      case when online_security.is_online_type(g.session_type)
        then coalesce(c.status = 'closed' or c.term_end <= public.business_date(), false)
        else coalesce(g.closed_at is not null or g.date_fin <= public.business_date(), false) end as ended,
      case when online_security.is_online_type(g.session_type)
        then coalesce(c.status <> 'closed' and c.term_end > public.business_date(), false)
        else coalesce(g.closed_at is null and g.date_fin > public.business_date(), false) end as ends_later
    from public.groups g left join public.online_courses c on c.group_id = g.id
  )
  select e.id, e.student_id, e.session_type, e.group_id,
    case
      when e.group_id is not null then
        case when coalesce((select k.ends_later from courses k where k.id = e.group_id), false) then 'kept_later' else 'end' end
      when e.status = 'Confirmed' and e.session_type in ('Mise à niveau', 'Adults', 'Summer Camp', 'One-to-One', 'Online', 'Online One-to-One')
        and (not exists (select 1 from courses k where k.session_type = e.session_type and k.yr = e.school_year
              and (e.level is null or e.level = k.niveau) and academic_security.course_of_one_allows(k.id, k.capacity, e.student_id))
          or exists (select 1 from courses k where k.session_type = e.session_type and k.yr = e.school_year
              and (e.level is null or e.level = k.niveau) and academic_security.course_of_one_allows(k.id, k.capacity, e.student_id)
              and not k.ended)) then 'kept_waiting'
      else 'end'
    end
  from public.enrollments e
  where e.school_year = p_school_year and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
$$;

-- ── 4. Group guards (D1, D4) ───────────────────────────────────────────────────
-- Re-created from 125 (D-H5a, D-H5b) with the CDC date window (Q3 = A, S5): checked
-- after the year is filled or validated, so it always sees the effective year,
-- whatever the trigger order. The early return for an unchanged year now skips only
-- the year checks.
create or replace function academic_security.guard_group_year() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_year text; v_first integer;
begin
  if tg_op = 'INSERT' and nullif(btrim(new.annee), '') is null then
    new.annee := replace(public.centre_school_year(), '/', '-');
  end if;
  if not (tg_op = 'UPDATE' and new.annee is not distinct from old.annee) then
    -- A group's year is never cleared once set.
    if tg_op = 'UPDATE' and nullif(btrim(new.annee), '') is null then
      raise exception 'Renseignez l’année scolaire du groupe.' using errcode = '22023', hint = 'egc.group_year_missing';
    end if;
    if nullif(btrim(new.annee), '') is not null and academic_security.school_year_of(new.annee) is null then
      raise exception 'Année scolaire du groupe invalide : utilisez le format 2026/2027.'
        using errcode = '22023', hint = 'egc.group_year_invalid';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.enrollments e where e.group_id = old.id
        and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
        and academic_security.school_year_of(e.school_year) is distinct from academic_security.school_year_of(new.annee)) then
      raise exception 'Réaffectez les apprenants avant de changer l’année scolaire du groupe.'
        using errcode = '23514', hint = 'egc.group_year_locked';
    end if;
  end if;
  -- CDC D1: both dates lie between 1 June of the first year and 31 August of the second.
  if (new.date_debut is not null or new.date_fin is not null) and (tg_op = 'INSERT'
      or new.annee is distinct from old.annee or new.date_debut is distinct from old.date_debut
      or new.date_fin is distinct from old.date_fin) then
    v_year := academic_security.school_year_of(new.annee);
    if v_year is null then
      raise exception 'Renseignez l’année scolaire du groupe.' using errcode = '22023', hint = 'egc.group_year_missing';
    end if;
    v_first := left(v_year, 4)::integer;
    if (new.date_debut is not null and new.date_debut not between make_date(v_first, 6, 1) and make_date(v_first + 1, 8, 31))
       or (new.date_fin is not null and new.date_fin not between make_date(v_first, 6, 1) and make_date(v_first + 1, 8, 31)) then
      raise exception 'Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin % au 31 août %).',
        v_first, v_first + 1 using errcode = '23514', hint = 'course.dates_outside_year';
    end if;
  end if;
  return new;
end $$;
drop trigger groups_year_guard on public.groups;
create trigger groups_year_guard before insert or update of annee, date_debut, date_fin on public.groups
  for each row execute function academic_security.guard_group_year();

-- The course guard reads only the row's new and old values and refuses rather than
-- modifies, so its order relative to the year guard changes no outcome.
create function academic_security.guard_course_group() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_command boolean := current_setting('eh.course_command', true) = 'on';
begin
  -- The closed mark changes only inside « Clôturer le cours », « Rouvrir le cours » and
  -- « Clôturer l'année », for every role and every direct write.
  if (tg_op = 'INSERT' and (new.closed_at is not null or new.closed_by is not null) and not v_command)
     or (tg_op = 'UPDATE' and (new.closed_at is distinct from old.closed_at or new.closed_by is distinct from old.closed_by)
       and not v_command) then
    raise exception 'Utilisez « Clôturer le cours » ou « Rouvrir le cours ».' using errcode = '42501', hint = 'course.mark_protected';
  end if;
  -- A closed course keeps its dates, year, programme, level and capacity until it is reopened.
  if tg_op = 'UPDATE' and old.closed_at is not null and new.closed_at is not null
     and (new.date_debut is distinct from old.date_debut or new.date_fin is distinct from old.date_fin
       or new.annee is distinct from old.annee or new.session_type is distinct from old.session_type
       or new.niveau is distinct from old.niveau or new.capacite_max is distinct from old.capacite_max) then
    raise exception 'Ce cours est clôturé. Rouvrez le cours pour le modifier.' using errcode = '23514', hint = 'course.closed';
  end if;
  -- Online courses keep their term on the online course page (Q9).
  if online_security.is_online_type(new.session_type) and (new.date_debut is not null or new.date_fin is not null) then
    raise exception 'Les dates d’un cours en ligne se modifient sur sa page Cours en ligne.'
      using errcode = '23514', hint = 'course.online_dates';
  end if;
  -- Q1 = A: a short-programme group gets both dates on creation, on a change into one of
  -- these programmes and on any date change, so they are never cleared.
  if academic_security.course_dates_required(new.session_type) and (tg_op = 'INSERT'
      or new.session_type is distinct from old.session_type or new.date_debut is distinct from old.date_debut
      or new.date_fin is distinct from old.date_fin)
     and (new.date_debut is null or new.date_fin is null) then
    raise exception 'Renseignez les dates du cours : date de début et date de fin.'
      using errcode = '23514', hint = 'course.dates_required';
  end if;
  -- Q4 = A: a One-to-One course has capacity 1.
  if new.session_type = 'One-to-One' and (tg_op = 'INSERT' or new.session_type is distinct from old.session_type
      or new.capacite_max is distinct from old.capacite_max) and new.capacite_max is distinct from 1 then
    raise exception 'Un cours individuel (One-to-One) a une capacité de 1.' using errcode = '23514', hint = 'course.one_to_one_capacity';
  end if;
  -- Q6: moving an end date (for example to stop a course early) is traceable.
  if tg_op = 'UPDATE' and (new.date_debut is distinct from old.date_debut or new.date_fin is distinct from old.date_fin) then
    perform academic_security.log('group_dates_changed', null, null, new.id, jsonb_build_object(
      'before', jsonb_build_object('date_debut', old.date_debut, 'date_fin', old.date_fin),
      'after', jsonb_build_object('date_debut', new.date_debut, 'date_fin', new.date_fin)));
  end if;
  return new;
end $$;
create trigger groups_course_guard before insert or update of date_debut, date_fin, session_type, capacite_max, niveau,
  annee, closed_at, closed_by on public.groups
  for each row execute function academic_security.guard_course_group();

-- ── 5. Placement guard (D4, S3, N-1) ───────────────────────────────────────────
-- Acts when a row enters a group: a new grouped row, a new group, or a grouped row
-- becoming live again (the year guard's notion). The group row is share-locked first,
-- the lock place() and the year guard already take, so the seat lock always follows it.
create function academic_security.guard_course_placement() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare g public.groups; v_status text;
  v_live constant text[] := array['Submitted','Under Review','Confirmed','Validated','Trial'];
begin
  if new.group_id is null then return new; end if;
  -- The Batch D two-flag restore writes journalled before-images verbatim.
  if current_setting('eh.membership_sync', true) = 'on' and current_setting('eh.enrollment_command', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.group_id is not distinct from old.group_id
     and not (coalesce(new.status, '') = any (v_live) and not coalesce(old.status, '') = any (v_live)) then
    return new;
  end if;
  select * into g from public.groups where id = new.group_id for share;
  if not found then return new; end if;
  if online_security.is_online_type(g.session_type) then
    -- S3: serialises with online_close_course, which takes this row for update.
    select c.status into v_status from public.online_courses c where c.group_id = new.group_id for share;
    if v_status = 'closed' then
      raise exception 'Ce cours est clôturé.' using errcode = '23514', hint = 'course.closed';
    end if;
    return new;
  end if;
  -- « A suivi ce cours » attaches into the group its close has just marked.
  if g.closed_at is not null and current_setting('eh.course_command', true) is distinct from 'on' then
    raise exception 'Ce cours est clôturé.' using errcode = '23514', hint = 'course.closed';
  end if;
  if academic_security.course_dates_required(g.session_type) and (g.date_debut is null or g.date_fin is null) then
    raise exception 'Renseignez les dates du cours avant d’y affecter un apprenant.'
      using errcode = '23514', hint = 'course.dates_required';
  end if;
  return new;
end $$;
create trigger enrollment_course_guard before insert or update of group_id, status on public.enrollments
  for each row execute function academic_security.guard_course_placement();

-- Re-created from 120 with one change (N-1): the group read takes `for share`, so the
-- group row is locked before the seat lock inside the function that takes it.
create or replace function academic_security.enforce_group_capacity() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_session text; v_capacity integer;
begin
  if new.group_id is null or new.status is not distinct from 'Rejected' then return new; end if;
  if tg_op = 'UPDATE' and new.group_id is not distinct from old.group_id
     and old.status is distinct from 'Rejected' then return new; end if;
  select g.session_type, g.capacite_max into v_session, v_capacity from public.groups g where g.id = new.group_id for share;
  if not found or online_security.is_online_type(v_session) or v_capacity is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('group:seats:' || new.group_id::text, 0));
  if academic_security.seats_taken(new.group_id, new.student_id) >= v_capacity
     and current_setting('eh.capacity_override', true) is distinct from 'on' then
    raise exception 'Ce groupe est complet.' using errcode = '23514', hint = 'egc.capacity';
  end if;
  return new;
end $$;

-- ── 6. Finished courses (D2) ───────────────────────────────────────────────────
create function public.list_courses_to_close()
returns table (kind text, group_id uuid, name text, session_type text, niveau text, school_year text,
  date_debut date, date_fin date, live_count integer, unplaced_count integer, empty boolean)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
  select x.kind, x.group_id, x.name, x.session_type, x.niveau, x.school_year, x.date_debut, x.date_fin,
    x.live_count, x.unplaced_count, x.live_count = 0
  from (
    select 'in_person'::text as kind, g.id as group_id, g.name, g.session_type, g.niveau,
      academic_security.school_year_of(g.annee) as school_year, g.date_debut, g.date_fin,
      (select count(*)::integer from public.enrollments e where e.group_id = g.id
        and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')) as live_count,
      (select count(*)::integer from academic_security.course_unplaced(g.id)) as unplaced_count
    from public.groups g
    where g.closed_at is null and g.date_fin < public.business_date()
      and not online_security.is_online_type(g.session_type)
    union all
    select 'online', g.id, g.name, g.session_type, g.niveau, academic_security.school_year_of(g.annee),
      c.term_start, c.term_end,
      (select count(*)::integer from public.enrollments e where e.group_id = g.id
        and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')), 0
    from public.groups g join public.online_courses c on c.group_id = g.id
    where c.status <> 'closed' and c.term_end < public.business_date()
      and exists (select 1 from public.enrollments e where e.group_id = g.id
        and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial'))
  ) x
  order by x.date_fin, x.name, x.group_id
  limit 200;
end $$;

-- ── 7. « Clôturer le cours » (D3) ─────────────────────────────────────────────
create function public.close_course_preview(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare g public.groups; v_members uuid[]; v_unplaced uuid[]; v_result jsonb;
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select * into g from public.groups where id = p_group;
  if not found then perform academic_security.stale(); end if;
  v_members := array(select e.id from public.enrollments e where e.group_id = p_group
    and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial') order by e.id);
  v_unplaced := array(select u.id from academic_security.course_unplaced(p_group) u order by u.id);
  select jsonb_build_object(
    'group_id', g.id, 'name', g.name, 'session_type', g.session_type, 'niveau', g.niveau,
    'school_year', academic_security.school_year_of(g.annee), 'date_debut', g.date_debut, 'date_fin', g.date_fin,
    'closed_at', g.closed_at, 'online', online_security.is_online_type(g.session_type),
    'course_of_one', coalesce(g.capacite_max, 0) = 1,
    'empty', cardinality(v_members) = 0,
    'finished', coalesce(g.date_fin < public.business_date(), false),
    'live_count', cardinality(v_members),
    'stay_enrolled', (select count(distinct e.student_id) from public.enrollments e where e.id = any(v_members)
      and exists (select 1 from public.enrollments x where x.student_id = e.student_id and x.id <> all(v_members)
        and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial'))),
    'become_alumni', (select count(distinct e.student_id) from public.enrollments e where e.id = any(v_members)
      and not exists (select 1 from public.enrollments x where x.student_id = e.student_id and x.id <> all(v_members)
        and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial'))),
    'open_balance_count', (select count(*) from public.charge_balances b where b.enrollment_id = any(v_members)
      and b.voided_at is null and b.balance > 0),
    'open_balance_total', (select coalesce(sum(b.balance), 0) from public.charge_balances b where b.enrollment_id = any(v_members)
      and b.voided_at is null and b.balance > 0),
    'charges_to_link', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(c.balance), 0))
      from unnest(v_members) m(id) cross join lateral academic_security.course_link_charges(m.id) c),
    'engagements', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(c.balance), 0))
      from unnest(v_members) m(id) cross join lateral academic_security.course_engagements(m.id) c),
    'next_session_deposits', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(d.amount), 0))
      from unnest(v_members) m(id) cross join lateral academic_security.course_late_deposits(m.id, g.date_fin) d),
    'unplaced', coalesce((select jsonb_agg(jsonb_build_object(
        'enrollment_id', u.id, 'student_id', u.student_id, 'full_name', s.full_name, 'level', u.level,
        -- What the learner paid for this enrollment, including the charges the close links (S6).
        'paid_total', (select coalesce(sum(r.montant_paye), 0) from public.receipts r
          where r.voided_at is null and r.deleted_at is null
            and (r.enrollment_id = u.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = u.id)
              or r.charge_id in (select l.charge_id from academic_security.course_link_charges(u.id) l))),
        'has_other_live', exists (select 1 from public.enrollments x where x.student_id = u.student_id and x.id <> u.id
          and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial')),
        'created_after_end', coalesce(public.business_date(u.created_at) > g.date_fin, false),
        'next_session_deposit', exists (select 1 from academic_security.course_late_deposits(u.id, g.date_fin)),
        'charges_to_link', (select count(*) from academic_security.course_link_charges(u.id)),
        'engagements', (select count(*) from academic_security.course_engagements(u.id)))
        order by s.full_name, u.id)
      from public.enrollments u join public.students s on s.id = u.student_id where u.id = any(v_unplaced)), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create function public.close_course(p_group uuid, p_expected_count integer, p_reason text default 'Cours terminé',
  p_attach uuid[] default '{}', p_end_unplaced uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare g public.groups; v_run uuid := gen_random_uuid(); v_today date := public.business_date();
  v_attach uuid[] := coalesce(p_attach, '{}'); v_end uuid[] := coalesce(p_end_unplaced, '{}');
  v_reason text := btrim(p_reason); v_empty boolean; v_learners uuid[]; v_members uuid[]; v_all uuid[];
  v_flag text; v_id uuid; v_student uuid; v_ended integer; v_ended_unplaced integer := 0; v_live integer;
  v_linked integer := 0; v_result jsonb; c record;
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  -- 1. Reason.
  if not academic_security.valid_reason(p_reason) then
    raise exception 'Motif requis (200 caractères au plus).' using errcode = '22023', hint = 'egc.reason_required';
  end if;
  if p_expected_count is null or p_expected_count < 0 then perform academic_security.stale(); end if;
  -- 2. Group.
  select * into g from public.groups where id = p_group;
  if not found then perform academic_security.stale(); end if;
  if online_security.is_online_type(g.session_type) then
    raise exception 'Clôturez ce cours depuis sa page Cours en ligne.' using errcode = '23514', hint = 'course.online';
  end if;
  -- 3. Replay: a closed course returns its latest run and writes nothing.
  if g.closed_at is not null then return academic_security.course_close_replay(p_group); end if;
  if (select count(*) from unnest(v_attach || v_end)) <> (select count(distinct x) from unnest(v_attach || v_end) x)
     or exists (select 1 from unnest(v_attach || v_end) x where x is null) then
    raise exception 'La liste des inscriptions payées sans groupe a changé, rechargez.'
      using errcode = 'PT409', hint = 'course.unplaced_changed';
  end if;
  -- 4. When a close is allowed (Q6 = A, OA2): an empty group at any time; otherwise
  -- only after the end date.
  v_empty := p_expected_count = 0 and cardinality(v_attach) = 0 and cardinality(v_end) = 0;
  if not v_empty and (g.date_fin is null or g.date_fin >= v_today) then
    raise exception 'Ce cours n’est pas terminé : sa date de fin est le %.',
      coalesce(to_char(g.date_fin, 'DD/MM/YYYY'), 'non renseignée') using errcode = '23514', hint = 'course.not_finished';
  end if;
  -- 5. Learner locks: the members' and the two lists' learners, in one pass, id order.
  v_learners := array(select distinct x.student_id from (
      select e.student_id from public.enrollments e where e.group_id = p_group
        and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      union select e.student_id from public.enrollments e where e.id = any(v_attach || v_end)) x
    where x.student_id is not null order by 1);
  perform 1 from public.students s where s.id = any(v_learners) order by s.id for update;
  -- 6. Mark the group right after the learner locks, before any attach (N-1). From here
  -- no placement can enter it: every path takes the group row before its seat lock.
  v_flag := academic_security.set_flag('eh.course_command', 'on');
  update public.groups set closed_at = now(), closed_by = auth.uid()
  where id = p_group and closed_at is null and (v_empty or (date_fin is not null and date_fin < v_today))
  returning * into g;
  if not found then
    perform academic_security.set_flag('eh.course_command', v_flag);
    if exists (select 1 from public.groups x where x.id = p_group and x.closed_at is not null) then
      return academic_security.course_close_replay(p_group);
    end if;
    perform academic_security.stale();
  end if;
  -- 7. Counts in a new statement after the mark: they see every placement that
  -- committed before it, and every member's learner must be one locked in step 5.
  v_members := array(select e.id from public.enrollments e where e.group_id = p_group
    and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial') order by e.id);
  v_live := cardinality(v_members);
  if v_live <> p_expected_count or exists (select 1 from public.enrollments e where e.id = any(v_members)
      and not (e.student_id = any(v_learners))) then
    raise exception 'Le nombre d’apprenants a changé, rechargez.' using errcode = 'PT409', hint = 'course.count_changed';
  end if;
  if exists (select 1 from unnest(v_attach || v_end) x where x not in (select u.id from academic_security.course_unplaced(p_group) u)) then
    raise exception 'La liste des inscriptions payées sans groupe a changé, rechargez.'
      using errcode = 'PT409', hint = 'course.unplaced_changed';
  end if;
  v_all := v_members || v_attach || v_end;
  -- 8. Journal first: the run, the enrollments it touches and their learner files.
  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, group_id, before, actor)
  values (v_run, 'close_course', 'run', 'groups', p_group, p_group, jsonb_build_object('expected_count', p_expected_count,
    'reason', v_reason, 'attach', to_jsonb(v_attach), 'end_unplaced', to_jsonb(v_end), 'date_fin', g.date_fin), auth.uid());
  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, group_id, before, actor)
  select v_run, 'close_course', case when e.id = any(v_attach) then 'attached' when e.id = any(v_end) then 'ended_unplaced'
      else 'ended' end, 'enrollments', e.id, p_group,
    jsonb_build_object('status', e.status, 'group_id', e.group_id, 'level', e.level, 'school_year', e.school_year,
      'session_type', e.session_type, 'student_id', e.student_id), auth.uid()
  from public.enrollments e where e.id = any(v_all) order by e.id;
  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, group_id, before, actor)
  select v_run, 'close_course', 'resynced', 'students', s.id, p_group,
    jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id), auth.uid()
  from public.students s where s.id = any(v_learners) order by s.id;
  -- 9. « A suivi ce cours » (B1): placed in the marked group through the placement core,
  -- under the close's exemption; no attendance is created.
  for v_id in select x from unnest(v_attach) x order by 1 loop
    select e.student_id into v_student from public.enrollments e where e.id = v_id;
    perform academic_security.place(v_student, p_group, v_id, null, null, null, 'Rattaché à la clôture du cours', false, null);
  end loop;
  -- 10. Charges (S6, N-2): the partly paid open unlinked charges are linked before anything ends.
  for c in select x.id as enrollment_id, l.charge_id from unnest(v_all) x(id)
      cross join lateral academic_security.course_link_charges(x.id) l order by x.id, l.charge_id loop
    insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, group_id, before, after, actor)
    values (v_run, 'close_course', 'charge_linked', 'charges', c.charge_id, p_group, jsonb_build_object('enrollment_id', null),
      jsonb_build_object('enrollment_id', c.enrollment_id), auth.uid());
    update public.charges set enrollment_id = c.enrollment_id where id = c.charge_id and enrollment_id is null;
    if not found then perform academic_security.stale(); end if;
    v_linked := v_linked + 1;
  end loop;
  -- 11. End (S1): members and attached rows through the group core, then the listed
  -- rows learner by learner. No second pass: nothing can enter the marked group.
  v_ended := academic_security.end_group_enrollments(p_group, 'Alumni', v_reason);
  for v_student in select distinct e.student_id from public.enrollments e where e.id = any(v_end) order by 1 loop
    v_ended_unplaced := v_ended_unplaced + academic_security.leave(v_student, 'Alumni', v_reason,
      array(select e.id from public.enrollments e where e.id = any(v_end) and e.student_id = v_student));
  end loop;
  if v_ended + v_ended_unplaced <> p_expected_count + cardinality(v_attach) + cardinality(v_end) then
    raise exception 'Le nombre d’apprenants a changé, rechargez.' using errcode = 'PT409', hint = 'course.count_changed';
  end if;
  -- 12. After-images, result, log.
  update maintenance.course_close_journal j set after = jsonb_build_object('status', e.status, 'ended_at', e.ended_at,
      'end_reason', e.end_reason, 'ended_group_id', e.ended_group_id)
  from public.enrollments e where j.run_id = v_run and j.entity = 'enrollments' and e.id = j.row_id;
  update maintenance.course_close_journal j set after = jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id)
  from public.students s where j.run_id = v_run and j.entity = 'students' and s.id = j.row_id;
  v_result := jsonb_build_object('group_id', p_group, 'closed_at', g.closed_at, 'run_id', v_run, 'replayed', false,
    'ended', p_expected_count, 'attached', cardinality(v_attach), 'ended_unplaced', cardinality(v_end),
    'total_ended', v_ended + v_ended_unplaced,
    'alumni', (select count(*) from public.students s where s.id = any(v_learners) and s.status = 'Alumni'),
    'still_enrolled', (select count(*) from public.students s where s.id = any(v_learners) and s.status = 'Enrolled'),
    'open_balance_count', (select count(*) from public.charge_balances b where b.enrollment_id = any(v_all)
      and b.voided_at is null and b.balance > 0),
    'charges_linked', v_linked,
    'engagements', (select count(*) from unnest(v_all) x(id) cross join lateral academic_security.course_engagements(x.id)),
    'next_session_deposits', (select count(*) from unnest(v_all) x(id)
      cross join lateral academic_security.course_late_deposits(x.id, g.date_fin)),
    'reason', v_reason);
  update maintenance.course_close_journal set after = v_result
  where run_id = v_run and action = 'run';
  perform academic_security.log('close_course', null, null, p_group, v_result - 'replayed' - 'closed_at' - 'group_id');
  perform academic_security.set_flag('eh.course_command', v_flag);
  return v_result;
end $$;

-- « Rouvrir le cours » (Q8 = A, S2): learners first, then the group row, then the seat
-- lock when members return. Restores exactly the rows of the latest close that are
-- unchanged since; a group closed by the year close only loses its mark.
create function public.reopen_course(p_group uuid, p_expected_closed_at timestamptz) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_run_row maintenance.course_close_journal; v_run uuid := gen_random_uuid(); v_flag text; v_flag2 text;
  j record; e public.enrollments; v_restored integer := 0; v_skipped jsonb := '[]'::jsonb;
  v_learners uuid[];
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_expected_closed_at is null then perform academic_security.stale(); end if;
  -- 1. The latest run, read without locks.
  select * into v_run_row from maintenance.course_close_journal x
  where x.group_id = p_group and x.action = 'run' and x.source in ('close_course', 'close_school_year')
  order by x.id desc limit 1;
  if not found then perform academic_security.stale(); end if;
  -- 2. Learners of that run's rows, id order (S2).
  v_learners := array(select distinct (x.before->>'student_id')::uuid from maintenance.course_close_journal x
    where x.run_id = v_run_row.run_id and x.entity = 'enrollments' order by 1);
  perform 1 from public.students s where s.id = any(v_learners) order by s.id for update;
  -- 3. Then the group row.
  v_flag := academic_security.set_flag('eh.course_command', 'on');
  update public.groups set closed_at = null, closed_by = null
  where id = p_group and closed_at = p_expected_closed_at;
  if not found then perform academic_security.stale(); end if;
  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, group_id, before, actor)
  values (v_run, 'reopen_course', 'reopened', 'groups', p_group, p_group,
    jsonb_build_object('closed_at', p_expected_closed_at, 'close_run_id', v_run_row.run_id, 'close_source', v_run_row.source), auth.uid());
  -- 4. Restore each row still ended by that close, whose learner has no other live
  -- enrollment of that programme and year.
  for j in select x.* from maintenance.course_close_journal x
      where x.run_id = v_run_row.run_id and x.entity = 'enrollments' order by x.row_id loop
    select * into e from public.enrollments where id = j.row_id for update;
    if not found or e.status is distinct from 'Ended' or e.ended_at is distinct from (j.after->>'ended_at')::timestamptz
       or e.end_reason is distinct from (j.after->>'end_reason') then
      v_skipped := v_skipped || jsonb_build_object('enrollment_id', j.row_id, 'reason', 'changed');
      insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, group_id, after, reverts_id, actor)
      values (v_run, 'reopen_course', 'skipped', 'enrollments', j.row_id, p_group, jsonb_build_object('reason', 'changed'), j.id, auth.uid());
      continue;
    end if;
    if exists (select 1 from public.enrollments x where x.student_id = e.student_id and x.id <> e.id
        and x.session_type = e.session_type and x.school_year = e.school_year and x.status not in ('Rejected', 'Ended')) then
      v_skipped := v_skipped || jsonb_build_object('enrollment_id', j.row_id, 'reason', 'duplicate');
      insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, group_id, after, reverts_id, actor)
      values (v_run, 'reopen_course', 'skipped', 'enrollments', j.row_id, p_group, jsonb_build_object('reason', 'duplicate'), j.id, auth.uid());
      continue;
    end if;
    -- The « Rouvrir l'inscription » transition, then members return to the group.
    v_flag2 := academic_security.set_flag('eh.enrollment_command', 'on');
    update public.enrollments set status = 'Confirmed', group_id = null, ended_at = null, ended_by = null,
      end_reason = null, ended_group_id = null
    where id = e.id;
    perform academic_security.set_flag('eh.enrollment_command', v_flag2);
    perform academic_security.log('reopen', e.id, e.student_id, p_group, jsonb_build_object('source', 'reopen_course'));
    if j.action = 'ended' then
      perform academic_security.place(e.student_id, p_group, e.id, null, null, null, 'Rouvrir le cours', false, null);
    end if;
    insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, group_id, before, after, reverts_id, actor)
    select v_run, 'reopen_course', 'restored', 'enrollments', x.id, p_group,
      jsonb_build_object('status', 'Ended'), jsonb_build_object('status', x.status, 'group_id', x.group_id), j.id, auth.uid()
    from public.enrollments x where x.id = e.id;
    v_restored := v_restored + 1;
  end loop;
  perform academic_security.set_flag('eh.course_command', v_flag);
  perform academic_security.log('reopen_course', null, null, p_group, jsonb_build_object('run_id', v_run,
    'close_run_id', v_run_row.run_id, 'restored', v_restored, 'skipped', jsonb_array_length(v_skipped)));
  return jsonb_build_object('group_id', p_group, 'run_id', v_run, 'restored', v_restored, 'skipped', v_skipped);
end $$;

-- ── 8. « Clôturer l'année » (D5) ──────────────────────────────────────────────
create function public.close_school_year_preview(p_school_year text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not academic_security.valid_school_year(p_school_year) then
    raise exception 'Année scolaire invalide.' using errcode = '22023', hint = 'egc.school_year_required';
  end if;
  return (
    with r as (select * from academic_security.year_close_rows(p_school_year))
    select jsonb_build_object(
      'school_year', p_school_year,
      'to_end', (select count(*) from r where r.outcome = 'end'),
      'kept_in_later_courses', (select count(*) from r where r.outcome = 'kept_later'),
      'kept_waiting_unplaced', jsonb_build_object('total', (select count(*) from r where r.outcome = 'kept_waiting'),
        'by_programme', coalesce((select jsonb_object_agg(x.session_type, x.n) from (select r.session_type, count(*) as n
          from r where r.outcome = 'kept_waiting' group by r.session_type) x), '{}'::jsonb)),
      -- Reviewer point: waiting rows carried over from an earlier school year.
      'carried_over_waiting', (select jsonb_build_object('total', coalesce(sum(x.n), 0), 'by_programme',
          coalesce(jsonb_object_agg(coalesce(x.session_type, '—'), x.n), '{}'::jsonb))
        from (select e.session_type, count(*) as n from public.enrollments e
          where e.status = 'Confirmed' and e.group_id is null and e.session_type is distinct from 'Other'
            and academic_security.valid_school_year(e.school_year)
            and left(e.school_year, 4)::integer < left(p_school_year, 4)::integer
          group by e.session_type) x),
      'groups_to_mark', (select count(*) from public.groups g
        where g.closed_at is null and not online_security.is_online_type(g.session_type)
          and academic_security.school_year_of(g.annee) = p_school_year
          and not coalesce(g.date_fin > public.business_date(), false))));
end $$;

-- Re-created from 120: same signature, role, reason, learner locks and integer result
-- (the number ended). It spares courses ending later (OA4), leaves waiting the paid rows
-- without a group whose course has not ended or does not exist yet (OA6, Q18), then locks
-- the year's group rows after the learners (for no key update) and, in a separate
-- statement, marks closed only those left without a live learner (Q16, N-3).
create or replace function public.close_school_year(p_school_year text, p_expected_count integer, p_reason text)
returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_count integer; v_student uuid; v_ended integer := 0; v_kept_later integer; v_kept_waiting integer;
  v_end_ids uuid[]; v_candidates uuid[]; v_marked uuid[]; v_flag text; v_run uuid; v_group uuid;
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not academic_security.valid_school_year(p_school_year) then
    raise exception 'Année scolaire invalide.' using errcode = '22023', hint = 'egc.school_year_required';
  end if;
  if not academic_security.valid_reason(p_reason) then
    raise exception 'Motif requis (200 caractères au plus).' using errcode = '22023', hint = 'egc.reason_required';
  end if;
  -- Every affected learner is locked in id order before the count is checked.
  perform 1 from public.students s where s.id in (select e.student_id from public.enrollments e
    where e.school_year = p_school_year and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial'))
    order by s.id for update;
  select count(*) filter (where r.outcome = 'end'), count(*) filter (where r.outcome = 'kept_later'),
    count(*) filter (where r.outcome = 'kept_waiting'),
    coalesce(array_agg(r.enrollment_id order by r.enrollment_id) filter (where r.outcome = 'end'), '{}')
    into v_count, v_kept_later, v_kept_waiting, v_end_ids from academic_security.year_close_rows(p_school_year) r;
  if v_count is distinct from p_expected_count then perform academic_security.stale(); end if;
  for v_student in select distinct e.student_id from public.enrollments e where e.id = any(v_end_ids) order by 1 loop
    v_ended := v_ended + academic_security.leave(v_student, 'Alumni', p_reason,
      array(select e.id from public.enrollments e where e.student_id = v_student and e.id = any(v_end_ids)));
  end loop;
  -- 1. Lock the candidate group rows after the learners, id order.
  v_candidates := array(select g.id from public.groups g
    where g.closed_at is null and not online_security.is_online_type(g.session_type)
      and academic_security.school_year_of(g.annee) = p_school_year
      and not coalesce(g.date_fin > public.business_date(), false)
    order by g.id for no key update of g);
  -- 2. A separate statement (a new snapshot) marks only those without a live learner.
  v_flag := academic_security.set_flag('eh.course_command', 'on');
  with marked as (
    update public.groups g set closed_at = now(), closed_by = auth.uid()
    where g.id = any(v_candidates) and g.closed_at is null
      and not exists (select 1 from public.enrollments e where e.group_id = g.id
        and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial'))
    returning g.id)
  select coalesce(array_agg(id order by id), '{}') into v_marked from marked;
  perform academic_security.set_flag('eh.course_command', v_flag);
  if cardinality(v_marked) > 0 then
    v_run := gen_random_uuid();
    foreach v_group in array v_marked loop
      insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, group_id, before, after, actor)
      values (v_run, 'close_school_year', 'run', 'groups', v_group, v_group,
        jsonb_build_object('school_year', p_school_year, 'reason', btrim(p_reason)),
        jsonb_build_object('group_id', v_group, 'run_id', v_run, 'source', 'close_school_year', 'school_year', p_school_year,
          'reason', btrim(p_reason), 'ended', 0, 'attached', 0, 'ended_unplaced', 0, 'total_ended', 0,
          'closed_at', (select g.closed_at from public.groups g where g.id = v_group)), auth.uid());
    end loop;
  end if;
  perform academic_security.log('close_school_year', null, null, null,
    jsonb_build_object('school_year', p_school_year, 'ended', v_ended, 'reason', btrim(p_reason),
      'kept_in_later_courses', v_kept_later, 'kept_waiting', v_kept_waiting, 'groups_marked', cardinality(v_marked),
      'groups_left_open', cardinality(v_candidates) - cardinality(v_marked), 'run_id', v_run));
  -- The number of enrollments actually ended.
  return v_ended;
end $$;

-- ── 9. Reception group RPC and the CRM picker ─────────────────────────────────
-- save_receptionist_group: the 125 body plus date_debut and date_fin in the key
-- allowlist, the insert, the update and the create-replay identity comparison.
CREATE OR REPLACE FUNCTION public.save_receptionist_group(p_group uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare g public.groups%rowtype;
  v_teacher uuid; v_session text; v_level text; begin
  perform operational_security.require_receptionist();
  if p_group is null then raise exception 'Stable group id required' using errcode='22023'; end if;
  perform operational_security.assert_keys(p_changes,array['name','langue','session_type','niveau','teacher_id',
    'salle','jours','horaire','capacite_max','terme','annee','categorie','date_debut','date_fin']);
  v_teacher:=nullif(p_changes->>'teacher_id','')::uuid;
  if p_changes ? 'teacher_id' and v_teacher is not null and not exists(
    select 1 from public.teachers t where t.id=v_teacher and t.deleted_at is null) then
    raise exception 'Teacher unavailable' using errcode='23514'; end if;
  if p_expected_updated_at is null then
    if nullif(btrim(p_changes->>'name'),'') is null or p_changes->>'niveau' is null then
      raise exception 'Group name and level required' using errcode='22023'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau') is not true then
      raise exception 'Invalid group session/level' using errcode='22023'; end if;
    insert into public.groups(id,name,langue,session_type,niveau,teacher_id,salle,jours,horaire,
      capacite_max,terme,annee,categorie,date_debut,date_fin)
    values(p_group,p_changes->>'name',coalesce(p_changes->>'langue','Anglais'),
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau',v_teacher,
      p_changes->>'salle',p_changes->>'jours',p_changes->>'horaire',
      coalesce((p_changes->>'capacite_max')::integer,12),p_changes->>'terme',
      p_changes->>'annee',p_changes->>'categorie',
      nullif(p_changes->>'date_debut','')::date,nullif(p_changes->>'date_fin','')::date) on conflict on constraint groups_pkey do nothing
    returning groups.id,groups.updated_at into id,updated_at;
    if id is null then
      select * into g from public.groups where groups.id=p_group for update;
      if g.name is distinct from p_changes->>'name' or
        g.langue is distinct from coalesce(p_changes->>'langue','Anglais') or
        g.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        g.niveau is distinct from p_changes->>'niveau' or g.teacher_id is distinct from v_teacher or
        g.salle is distinct from p_changes->>'salle' or g.jours is distinct from p_changes->>'jours' or
        g.horaire is distinct from p_changes->>'horaire' or
        g.capacite_max is distinct from coalesce((p_changes->>'capacite_max')::integer,12) or
        g.terme is distinct from p_changes->>'terme' or g.annee is distinct from coalesce(nullif(btrim(p_changes->>'annee'),''),g.annee) or
        g.categorie is distinct from p_changes->>'categorie' or
        g.date_debut is distinct from nullif(p_changes->>'date_debut','')::date or
        g.date_fin is distinct from nullif(p_changes->>'date_fin','')::date then
        raise exception 'Group create identity conflict' using errcode='23505'; end if;
      id:=g.id; updated_at:=g.updated_at;
    end if;
  else
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into g from public.groups where groups.id=p_group for update;
    if not found or g.updated_at is distinct from p_expected_updated_at then
      raise exception 'Group unavailable or stale' using errcode='PT409'; end if;
    v_session:=case when p_changes ? 'session_type' then p_changes->>'session_type' else g.session_type end;
    v_level:=case when p_changes ? 'niveau' then p_changes->>'niveau' else g.niveau end;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and
      operational_security.valid_session_level(v_session,v_level) is not true then
      raise exception 'Invalid group session/level' using errcode='22023'; end if;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and (
      exists(select 1 from public.enrollments e where e.group_id=p_group)
      or exists(select 1 from public.students s where s.groupe_id=p_group and s.deleted_at is null)) then
      raise exception 'Reassign learners before changing group session or level' using errcode='23514'; end if;
    update public.groups set
      name=case when p_changes ? 'name' then p_changes->>'name' else g.name end,
      langue=case when p_changes ? 'langue' then p_changes->>'langue' else g.langue end,
      session_type=v_session,niveau=v_level,
      teacher_id=case when p_changes ? 'teacher_id' then v_teacher else g.teacher_id end,
      salle=case when p_changes ? 'salle' then p_changes->>'salle' else g.salle end,
      jours=case when p_changes ? 'jours' then p_changes->>'jours' else g.jours end,
      horaire=case when p_changes ? 'horaire' then p_changes->>'horaire' else g.horaire end,
      capacite_max=case when p_changes ? 'capacite_max' then (p_changes->>'capacite_max')::integer else g.capacite_max end,
      terme=case when p_changes ? 'terme' then p_changes->>'terme' else g.terme end,
      annee=case when p_changes ? 'annee' then p_changes->>'annee' else g.annee end,
      categorie=case when p_changes ? 'categorie' then p_changes->>'categorie' else g.categorie end,
      date_debut=case when p_changes ? 'date_debut' then nullif(p_changes->>'date_debut','')::date else g.date_debut end,
      date_fin=case when p_changes ? 'date_fin' then nullif(p_changes->>'date_fin','')::date else g.date_fin end
    where groups.id=p_group returning groups.id,groups.updated_at into id,updated_at;
  end if;
  return next;
end $function$;

-- crm_enrollment_groups: the 125 body without closed courses (in person and online);
-- each row also carries its end date, so a finished course is marked « terminé le … ».
CREATE OR REPLACE FUNCTION public.crm_enrollment_groups(p_session text, p_level text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare result jsonb; begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 with eligible as(select id,name,niveau,session_type,annee from public.groups where session_type=p_session and (p_level is null or niveau=p_level)
   and closed_at is null and not exists(select 1 from public.online_courses c where c.group_id=groups.id and c.status='closed')),
 page as(select eligible.*,(select g.date_fin from public.groups g where g.id=eligible.id) date_fin from eligible order by name,id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by name,id) from page p),'[]'::jsonb)) into result;
 return result;
end $function$;

-- ── 10. Group visibility for parents and students (D6, OA3) ────────────────────
-- The groups of the caller's visible learners: live (group_id), past (ended_group_id)
-- and the file's group. Runs once per statement (ADR-013).
create function public.family_group_ids() returns setof uuid
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select e.group_id from public.enrollments e
  where e.group_id is not null and e.student_id in (select public.get_visible_student_ids())
  union
  select e.ended_group_id from public.enrollments e
  where e.ended_group_id is not null and e.student_id in (select public.get_visible_student_ids())
  union
  select s.groupe_id from public.students s
  where s.groupe_id is not null and s.id in (select public.get_visible_student_ids())
$$;

drop policy "groups read all auth" on public.groups;
create policy "groups read staff" on public.groups for select to authenticated
  using ((select auth.uid()) is not null
    and coalesce((select public.get_my_role()), 'pending') not in ('pending', 'parent', 'student'));
create policy "groups read family" on public.groups for select to authenticated
  using ((select public.get_my_role()) in ('parent', 'student') and id in (select public.family_group_ids()));

-- ── 11. Grants ───────────────────────────────────────────────────────────────
revoke all on function academic_security.course_dates_required(text) from public, anon, authenticated, service_role;
revoke all on function academic_security.course_of_one_allows(uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function academic_security.course_unplaced(uuid) from public, anon, authenticated, service_role;
revoke all on function academic_security.course_link_charges(uuid) from public, anon, authenticated, service_role;
revoke all on function academic_security.course_engagements(uuid) from public, anon, authenticated, service_role;
revoke all on function academic_security.course_late_deposits(uuid, date) from public, anon, authenticated, service_role;
revoke all on function academic_security.course_close_replay(uuid) from public, anon, authenticated, service_role;
revoke all on function academic_security.year_close_rows(text) from public, anon, authenticated, service_role;
revoke all on function academic_security.guard_course_group() from public, anon, authenticated, service_role;
revoke all on function academic_security.guard_course_placement() from public, anon, authenticated, service_role;
revoke all on function public.list_courses_to_close() from public, anon, service_role;
revoke all on function public.close_course_preview(uuid) from public, anon, service_role;
revoke all on function public.close_course(uuid, integer, text, uuid[], uuid[]) from public, anon, service_role;
revoke all on function public.reopen_course(uuid, timestamptz) from public, anon, service_role;
revoke all on function public.close_school_year_preview(text) from public, anon, service_role;
revoke all on function public.family_group_ids() from public, anon, service_role;
grant execute on function public.list_courses_to_close() to authenticated;
grant execute on function public.close_course_preview(uuid) to authenticated;
grant execute on function public.close_course(uuid, integer, text, uuid[], uuid[]) to authenticated;
grant execute on function public.reopen_course(uuid, timestamptz) to authenticated;
grant execute on function public.close_school_year_preview(text) to authenticated;
grant execute on function public.family_group_ids() to authenticated;

notify pgrst, 'reload schema';

commit;

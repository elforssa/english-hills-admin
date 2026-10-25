-- Batch D (plan EGC-r2, ADR-010), migration M1: group membership derives from
-- enrollments. Additive and forward-only; it changes no existing row. Readers
-- keep the union of the learner-file group and enrollments until migration M2
-- (the enforcement migration), which runs only after the owner-approved data
-- clean-up (the academic_security.egc_cleanup_* cores below).
--
-- Re-created functions start from their latest cumulative definitions:
--   sync_student_from_enrollments (074), enforce_enrollment_student_sync and
--   check_enrollment_student_sync (072), create_charge_payment,
--   assign_receptionist_student_group, save_receptionist_student and
--   crm_start_enrollment (119, the ADR-009 PT409 rebuild), save_receptionist_enrollment
--   (117), soft_delete_student (041), remove_student_group (074),
--   crm_security.evaluate_conversion (084) and online_close_course (118).
-- Dropped: trigger student_enrollment_assignment_sync and its function
-- sync_enrollments_from_student (074). Every stale or conflicting write raises
-- PT409 with a closed egc.* hint (ADR-009).
begin;

-- I3 pre-check: the unique index below must not meet a duplicate.
do $$ begin
  if exists (select 1 from public.enrollments e where e.status is distinct from 'Rejected'
      and e.session_type is not null and e.school_year is not null
      group by e.student_id, e.session_type, e.school_year having count(*) > 1) then
    raise exception 'EGC M1: a learner has two live enrollments for one programme and school year; resolve before applying'
      using errcode = '23505';
  end if;
end $$;

-- D-1: the terminal status Ended. Ending moves group_id to ended_group_id, so
-- every positive membership test and every online seat count excludes it.
alter table public.enrollments drop constraint enrollments_status_check;
alter table public.enrollments add constraint enrollments_status_check
  check (status in ('Submitted','Under Review','Confirmed','Validated','Rejected','Trial','Ended'));
alter table public.enrollments
  add column ended_at timestamptz,
  add column ended_by uuid,
  add column end_reason text,
  add column ended_group_id uuid references public.groups(id) on delete restrict;
alter table public.enrollments add constraint enrollments_end_reason_length
  check (end_reason is null or char_length(btrim(end_reason)) between 1 and 200);
create index enrollments_ended_group_idx on public.enrollments (ended_group_id) where ended_group_id is not null;
-- I1 and I9 hold for every new or changed row now; M2 validates them for every row.
alter table public.enrollments add constraint enrollments_active_requires_group
  check (coalesce(status, '') not in ('Validated','Trial') or group_id is not null) not valid;
alter table public.enrollments add constraint enrollments_ended_shape
  check ((coalesce(status, '') = 'Ended') = (ended_at is not null)
    and (coalesce(status, '') <> 'Ended' or group_id is null)) not valid;
alter table public.enrollments add constraint enrollments_confirmed_has_programme
  check (coalesce(status, '') not in ('Confirmed','Validated','Trial')
    or (session_type is not null and school_year is not null)) not valid;
-- I3: one live enrollment per learner, programme and school year.
create unique index enrollments_one_active_programme_year on public.enrollments (student_id, session_type, school_year)
  where status not in ('Rejected','Ended') and session_type is not null and school_year is not null;

-- Private schemas: no API role has usage; only SECURITY DEFINER code owned by
-- the migration role reaches them.
create schema academic_security;
revoke all on schema academic_security from public, anon, authenticated, service_role;
create schema maintenance;
revoke all on schema maintenance from public, anon, authenticated, service_role;
-- Clean-up journal: ids, statuses, groups and years only, never names or contacts.
create table maintenance.egc_cleanup_log (
  id bigint generated always as identity primary key,
  step text not null,
  entity text not null check (entity in ('enrollments','students','charges')),
  row_id uuid not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
alter table maintenance.egc_cleanup_log enable row level security;
revoke all on table maintenance.egc_cleanup_log from public, anon, authenticated, service_role;

-- ── Helpers ───────────────────────────────────────────────────────────────
create function academic_security.stale() returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$ begin
  raise exception 'Cette inscription a changé, rechargez.' using errcode = 'PT409', hint = 'egc.stale';
end $$;
create function academic_security.duplicate() returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$ begin
  raise exception 'Une inscription active existe déjà pour ce programme et cette année.'
    using errcode = 'PT409', hint = 'egc.duplicate_enrollment';
end $$;
-- Transaction-local command flags; returns the previous value so callers restore it.
create function academic_security.set_flag(p_name text, p_value text) returns text
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_previous text := coalesce(current_setting(p_name, true), '');
begin
  perform set_config(p_name, coalesce(p_value, ''), true);
  return v_previous;
end $$;
create function academic_security.today() returns date
language sql stable set search_path = pg_catalog, pg_temp as $$
  select (now() at time zone 'Africa/Casablanca')::date
$$;
-- School year of a civil date (September start), as crm_security.enrollment_year.
create function academic_security.school_year_on(p_date date) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select y::text || '/' || (y + 1)::text from (
    select extract(year from p_date)::integer - case when extract(month from p_date) < 9 then 1 else 0 end as y) x
$$;
-- groups.annee 'YYYY-YYYY' (or 'YYYY/YYYY') as an enrollment school year.
create function academic_security.school_year_of(p_annee text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when btrim(p_annee) ~ '^[0-9]{4}[-/][0-9]{4}$'
    and right(btrim(p_annee), 4)::integer = left(btrim(p_annee), 4)::integer + 1
    then left(btrim(p_annee), 4) || '/' || right(btrim(p_annee), 4) end
$$;
create function academic_security.valid_school_year(p_year text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(p_year ~ '^[0-9]{4}/[0-9]{4}$' and right(p_year, 4)::integer = left(p_year, 4)::integer + 1, false)
$$;
create function academic_security.valid_reason(p_reason text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(char_length(btrim(p_reason)) between 1 and 200, false)
$$;

-- D-1: the only membership rule. A learner is a member of a group when an
-- enrollment in that group is Validated or Trial and the file is not archived.
create function academic_security.is_group_member(p_student uuid, p_group uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id
    where e.student_id = p_student and e.group_id = p_group and e.status in ('Validated','Trial')
      and s.deleted_at is null)
$$;
create function academic_security.group_member_ids(p_group uuid) returns setof uuid
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select distinct e.student_id from public.enrollments e join public.students s on s.id = e.student_id
  where e.group_id = p_group and e.status in ('Validated','Trial') and s.deleted_at is null
$$;
-- Main group: keep the current one while it is a membership; otherwise the
-- membership of the file programme, then Yearly, then Validated, then oldest.
create function academic_security.main_group_for(p_student uuid, p_current uuid, p_session text) returns uuid
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce(
    (select e.group_id from public.enrollments e where e.student_id = p_student and e.group_id = p_current
       and e.status in ('Validated','Trial') limit 1),
    (select e.group_id from public.enrollments e join public.groups g on g.id = e.group_id
      where e.student_id = p_student and e.status in ('Validated','Trial')
      order by (g.session_type is not distinct from p_session) desc, (g.session_type = 'Yearly') desc,
        (e.status = 'Validated') desc, e.created_at, e.id
      limit 1))
$$;
-- Seats taken in an in-person group by other learners: a non-Rejected
-- enrollment in it, or (until M2) a file placed in it.
create function academic_security.seats_taken(p_group uuid, p_student uuid) returns integer
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select count(*)::integer from (
    select e.student_id from public.enrollments e join public.students s on s.id = e.student_id
    where e.group_id = p_group and e.status is distinct from 'Rejected' and s.deleted_at is null
      and e.student_id is distinct from p_student
    union
    select s.id from public.students s
    where s.groupe_id = p_group and s.deleted_at is null and s.id is distinct from p_student) x
$$;
-- Locks the learner first (shared order: learner, enrollments, group) and
-- checks its expected version.
create function academic_security.lock_learner(p_student uuid, p_expected timestamptz, p_require_fresh boolean)
returns public.students language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare s public.students;
begin
  select * into s from public.students where id = p_student and deleted_at is null for update;
  if not found or (p_require_fresh and (p_expected is null or s.updated_at is distinct from p_expected)) then
    perform academic_security.stale();
  end if;
  return s;
end $$;
create function academic_security.log(p_kind text, p_enrollment uuid, p_student uuid, p_group uuid, p_details jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_email text;
begin
  select p.email into v_email from public.profiles p where p.id = auth.uid();
  insert into public.activity_log(actor_id, actor_email, action, target_table, target_id, changed_columns, before, after)
  values (auth.uid(), v_email, 'UPDATE', 'enrollments', coalesce(p_enrollment, p_student), array[p_kind], null,
    jsonb_build_object('kind', p_kind, 'student_id', p_student, 'group_id', p_group) || coalesce(p_details, '{}'::jsonb));
end $$;

-- ── Enrollment → learner sync (D-3) ───────────────────────────────────────
create or replace function public.sync_student_from_enrollments(
  p_student uuid, p_force_downgrade boolean, p_previous_group uuid
) returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_current public.students%rowtype;
  v_status text;
  v_student_status text;
  v_leaver text := current_setting('eh.leaver_status', true);
  v_main uuid;
  v_session text;
  v_level text;
  v_flag text;
begin
  -- No depth guard any more: no trigger on students writes enrollments, so a
  -- nested enrollment write (from another trigger) must still resync.
  if p_student is null then return; end if;
  select * into v_current from public.students where id = p_student for update;
  if not found then return; end if;

  select e.status into v_status
  from public.enrollments e where e.student_id = p_student
  order by case e.status
    when 'Validated' then 0 when 'Trial' then 1 when 'Confirmed' then 2
    when 'Under Review' then 3 when 'Submitted' then 4 else 5 end,
    e.updated_at desc, e.created_at desc, e.id desc
  limit 1;

  -- I7: Enrolled from a confirmed enrollment, Trial from a trial; Alumni and
  -- Inactive only from the leaver/archive core; otherwise the 074 mapping.
  if exists (select 1 from public.enrollments e where e.student_id = p_student and e.status in ('Confirmed','Validated')) then
    v_student_status := 'Enrolled';
  elsif exists (select 1 from public.enrollments e where e.student_id = p_student and e.status = 'Trial') then
    v_student_status := 'Trial';
  elsif v_leaver in ('Alumni','Inactive') then
    v_student_status := v_leaver;
  else
    v_student_status := case v_status
      when 'Rejected' then 'Inactive'
      when 'Ended' then case when v_current.status in ('Alumni','Inactive') then v_current.status else 'Inactive' end
      else 'Prospect' end;
    if not p_force_downgrade and v_current.status in ('Enrolled','Trial','Alumni','Inactive') then
      v_student_status := v_current.status;
    end if;
  end if;

  v_main := academic_security.main_group_for(p_student, v_current.groupe_id, v_current.session_type);
  -- M1 transition (removed by M2): a file group that is not a membership (a
  -- dossier-only placement before the clean-up) stays the main group, unless a
  -- forced downgrade left that same group (074, D-3) or the learner was placed
  -- in another group of the same programme. Edits, rejections and deletions of
  -- non-member enrollments never clear it.
  if v_current.groupe_id is not null and v_main is distinct from v_current.groupe_id
    and not (p_force_downgrade and v_current.groupe_id is not distinct from p_previous_group)
    and not exists (select 1 from public.enrollments e join public.groups mg on mg.id = e.group_id
      join public.groups fg on fg.id = v_current.groupe_id
      where e.student_id = p_student and e.status in ('Validated','Trial') and mg.session_type = fg.session_type) then
    v_main := v_current.groupe_id;
    -- The kept group is still an active placement (owner decision 1): its
    -- Enrolled/Trial status is not downgraded by ending another enrollment.
    if coalesce(v_leaver, '') not in ('Alumni','Inactive') and v_current.status in ('Enrolled','Trial')
       and v_student_status not in ('Enrolled','Trial') then
      v_student_status := v_current.status;
    end if;
  elsif v_main is not null then
    select g.session_type, g.niveau into v_session, v_level from public.groups g where g.id = v_main;
  end if;

  v_flag := academic_security.set_flag('eh.membership_sync', 'on');
  update public.students s set
    status = v_student_status,
    groupe_id = v_main,
    session_type = coalesce(v_session, s.session_type),
    niveau_cefr = case when v_session is not null then v_level else s.niveau_cefr end
  where s.id = p_student
    and (s.status is distinct from v_student_status or s.groupe_id is distinct from v_main
      or (v_session is not null and (s.session_type is distinct from v_session or s.niveau_cefr is distinct from v_level)));
  perform academic_security.set_flag('eh.membership_sync', v_flag);
end;
$$;

-- Unchanged from 072: Ended, like every status outside Validated, Trial and
-- Confirmed, is already a downgrade that passes the previous group.
create or replace function public.enforce_enrollment_student_sync()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    if new.student_id is null then
      raise exception 'Enrollment requires a student' using errcode = '23514';
    end if;
    if new.status in ('Validated','Trial') and new.group_id is null then
      raise exception 'Active enrollment requires a group' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
      raise exception 'Enrollment student is immutable' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then
    perform public.sync_student_from_enrollments(old.student_id,
      old.status in ('Validated','Trial','Confirmed'), old.group_id);
    return old;
  end if;
  perform public.sync_student_from_enrollments(new.student_id,
    tg_op = 'UPDATE' and (
      (old.status in ('Validated','Trial','Confirmed')
        and new.status not in ('Validated','Trial','Confirmed'))
      or (old.status in ('Validated','Trial') and new.status = 'Confirmed')),
    case when tg_op = 'UPDATE' then old.group_id else null end);
  return new;
end;
$$;

-- Group assignment is the academic validation step. Existing Trial and
-- Validated enrollments still require a group, as before.
create or replace function public.check_enrollment_student_sync()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_group_session text;
  v_group_level text;
begin
  if new.student_id is null then
    raise exception 'Enrollment requires a student' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
    raise exception 'Enrollment student is immutable' using errcode = '23514';
  end if;
  if new.status = 'Confirmed' and new.group_id is not null then
    new.status := 'Validated';
  end if;
  if new.status in ('Validated','Trial') and new.group_id is null then
    raise exception 'Active enrollment requires a group' using errcode = '23514';
  end if;
  -- I1: an ended enrollment has an end date and no group; only it has an end date.
  if new.status = 'Ended' and (new.group_id is not null or new.ended_at is null) then
    raise exception 'Une inscription terminée n’a plus de groupe et porte sa date de fin.' using errcode = '23514';
  end if;
  if new.status is distinct from 'Ended' and new.ended_at is not null then
    raise exception 'Seule une inscription terminée porte une date de fin.' using errcode = '23514';
  end if;
  -- I4, evaluated only when the assignment itself changes, so an untouched row
  -- (a payment, a status change) never fails on a group edit.
  if new.group_id is not null and new.session_type is not null and (tg_op = 'INSERT'
      or new.group_id is distinct from old.group_id or new.session_type is distinct from old.session_type
      or new.level is distinct from old.level) then
    select g.session_type, g.niveau into v_group_session, v_group_level
    from public.groups g where g.id = new.group_id;
    if found and (v_group_session is distinct from new.session_type
      or (new.level is not null and v_group_level is distinct from new.level)) then
      raise exception 'Enrollment group must match its session and level' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- The learner file no longer writes enrollments (DAT-1, DAT-2).
drop trigger student_enrollment_assignment_sync on public.students;
drop function public.sync_enrollments_from_student();

-- ── Guards ────────────────────────────────────────────────────────────────
-- I2 and I7: the file group, programme, level and status follow enrollments.
-- Only the sync (eh.membership_sync) writes them; unchanged values pass.
create function academic_security.guard_student_membership() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if current_setting('eh.membership_sync', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.groupe_id is not null then
      raise exception 'Affectez le groupe depuis l’inscription.' using errcode = '23514', hint = 'egc.group_from_enrollment';
    end if;
    -- D3-A: a new file is a prospect until an enrollment confirms it.
    if new.status in ('Enrolled','Trial') then new.status := 'Prospect'; end if;
    return new;
  end if;
  -- The foreign key clears the file group of a deleted group.
  if new.groupe_id is distinct from old.groupe_id and not (new.groupe_id is null
      and not exists (select 1 from public.groups g where g.id = old.groupe_id)) then
    raise exception 'Affectez le groupe depuis l’inscription.' using errcode = '23514', hint = 'egc.group_from_enrollment';
  end if;
  if (new.session_type is distinct from old.session_type or new.niveau_cefr is distinct from old.niveau_cefr)
    and (old.groupe_id is not null or exists (select 1 from public.enrollments e
      where e.student_id = old.id and e.group_id is not null and e.status in ('Validated','Trial'))) then
    raise exception 'Le programme et le niveau suivent le groupe ; modifiez l’inscription.'
      using errcode = '23514', hint = 'egc.programme_follows_group';
  end if;
  if new.status is distinct from old.status then
    if new.status in ('Alumni','Inactive') and exists (select 1 from public.enrollments e where e.student_id = old.id
        and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')) then
      raise exception 'Utilisez « Ancien apprenant » pour terminer les inscriptions.' using errcode = '23514', hint = 'egc.use_leaver';
    end if;
    if (new.status in ('Enrolled','Trial') and not exists (select 1 from public.enrollments e
          where e.student_id = old.id and e.status in ('Confirmed','Validated','Trial')))
      or (new.status = 'Prospect' and exists (select 1 from public.enrollments e
          where e.student_id = old.id and e.status in ('Confirmed','Validated','Trial'))) then
      raise exception 'Le statut de l’apprenant suit ses inscriptions.' using errcode = '23514', hint = 'egc.status_follows_enrollment';
    end if;
  end if;
  return new;
end $$;
create trigger students_membership_guard before insert or update of groupe_id, session_type, niveau_cefr, status
  on public.students for each row execute function academic_security.guard_student_membership();

-- I5 (ACA-1, D7-A): a populated group keeps its programme and level, for every role.
create function academic_security.guard_group_level() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if (new.session_type is distinct from old.session_type or new.niveau is distinct from old.niveau) and (
      exists (select 1 from public.enrollments e where e.group_id = old.id and e.status is distinct from 'Rejected')
      or exists (select 1 from public.students s where s.groupe_id = old.id and s.deleted_at is null)) then
    raise exception 'Réaffectez les apprenants avant de changer le programme ou le niveau du groupe.'
      using errcode = '23514', hint = 'egc.group_level_locked';
  end if;
  return new;
end $$;
create trigger groups_membership_level_guard before update of session_type, niveau on public.groups
  for each row execute function academic_security.guard_group_level();

-- I6 (ACA-6, D4-A): in-person capacity at group assignment of any non-Rejected
-- enrollment, never on a status-only change (same rule and lock style as the
-- 117 online trigger, which keeps governing online groups).
create function academic_security.enforce_group_capacity() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_session text; v_capacity integer;
begin
  if new.group_id is null or new.status is not distinct from 'Rejected' then return new; end if;
  if tg_op = 'UPDATE' and new.group_id is not distinct from old.group_id
     and old.status is distinct from 'Rejected' then return new; end if;
  select g.session_type, g.capacite_max into v_session, v_capacity from public.groups g where g.id = new.group_id;
  if not found or online_security.is_online_type(v_session) or v_capacity is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('group:seats:' || new.group_id::text, 0));
  if academic_security.seats_taken(new.group_id, new.student_id) >= v_capacity
     and current_setting('eh.capacity_override', true) is distinct from 'on' then
    raise exception 'Ce groupe est complet.' using errcode = '23514', hint = 'egc.capacity';
  end if;
  return new;
end $$;
create trigger enrollment_group_capacity before insert or update of group_id, status on public.enrollments
  for each row execute function academic_security.enforce_group_capacity();

-- I10: Ended rows are history, and Trial/Confirmed/Validated rows are deleted
-- only by the commands (eh.enrollment_command). Notes stay editable.
create function academic_security.guard_enrollment_history() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if current_setting('eh.enrollment_command', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status in ('Trial','Confirmed','Validated','Ended') then
      raise exception 'Cette inscription ne peut pas être supprimée : utilisez « Ancien apprenant » ou retirez le groupe.'
        using errcode = '42501', hint = 'egc.history_protected';
    end if;
    return old;
  end if;
  if (coalesce(old.status, '') = 'Ended') <> (coalesce(new.status, '') = 'Ended')
    or (old.status = 'Ended' and (to_jsonb(new) - array['notes','updated_at']) is distinct from (to_jsonb(old) - array['notes','updated_at'])) then
    raise exception 'Une inscription terminée ne se modifie que par ses notes ou par « Rouvrir l’inscription ».'
      using errcode = '42501', hint = 'egc.history_protected';
  end if;
  return new;
end $$;
create trigger enrollments_history_guard before update or delete on public.enrollments
  for each row execute function academic_security.guard_enrollment_history();

-- ── Cores (D-4); the clean-up calls them with a null actor ────────────────
create function academic_security.place(p_student uuid, p_group uuid, p_enrollment uuid, p_school_year text,
  p_student_updated_at timestamptz, p_enrollment_updated_at timestamptz, p_override_reason text, p_require_fresh boolean)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare s public.students; e public.enrollments; g public.groups; v_locked public.groups;
  v_ids uuid[]; v_year text; v_id uuid; v_full boolean := false; v_flag text; v_constraint text;
  v_reason text := nullif(btrim(p_override_reason), '');
begin
  s := academic_security.lock_learner(p_student, p_student_updated_at, p_require_fresh);
  select * into g from public.groups where id = p_group;
  if not found then raise exception 'Groupe introuvable.' using errcode = '23514', hint = 'egc.group_unavailable'; end if;
  if p_enrollment is not null then
    select * into e from public.enrollments where id = p_enrollment for update;
    if not found or e.student_id is distinct from p_student or (p_require_fresh
        and (p_enrollment_updated_at is null or e.updated_at is distinct from p_enrollment_updated_at)) then
      perform academic_security.stale();
    end if;
  else
    -- DAT-1: only the enrollment of this group's programme; others stay untouched.
    v_year := coalesce(nullif(btrim(p_school_year), ''), academic_security.school_year_of(g.annee));
    if not academic_security.valid_school_year(v_year) then
      raise exception 'Année scolaire requise pour cette affectation.' using errcode = '22023', hint = 'egc.school_year_required';
    end if;
    select array_agg(x.id order by x.id) into v_ids from public.enrollments x
    where x.student_id = p_student and x.session_type = g.session_type and x.school_year = v_year
      and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial');
    if cardinality(v_ids) > 1 or (v_ids is null and exists (select 1 from public.enrollments x
        where x.student_id = p_student and coalesce(x.session_type, g.session_type) = g.session_type
          and x.school_year is distinct from v_year and x.group_id is null
          and x.status in ('Submitted','Under Review','Confirmed'))) then
      raise exception 'Sélectionnez l’inscription à affecter.' using errcode = '23514', hint = 'egc.select_enrollment';
    end if;
    if v_ids is not null then
      select * into e from public.enrollments where id = v_ids[1] for update;
      -- D1: one group per programme and year; moving needs the enrollment named.
      if e.group_id is not null and e.group_id <> p_group then
        raise exception 'Cet apprenant est déjà dans un autre groupe de ce programme pour cette année.'
          using errcode = '23514', hint = 'egc.already_placed';
      end if;
    end if;
  end if;
  -- The group last: the share lock holds its programme and level (I5) for the write.
  select * into v_locked from public.groups where id = p_group for share;
  if not found or v_locked.session_type is distinct from g.session_type or v_locked.niveau is distinct from g.niveau
     or v_locked.annee is distinct from g.annee then
    perform academic_security.stale();
  end if;
  if e.id is not null then
    if e.status not in ('Submitted','Under Review','Confirmed','Validated','Trial') then
      raise exception 'Cette inscription ne peut pas être affectée.' using errcode = '23514', hint = 'egc.enrollment_not_placeable';
    end if;
    -- While placed, an enrollment's level is its group's (I4): a move takes the
    -- new group's level; an unplaced enrollment with a level must match.
    if coalesce(e.session_type, g.session_type) is distinct from g.session_type
       or (e.group_id is null and e.level is not null and e.level is distinct from g.niveau) then
      raise exception 'Le groupe doit correspondre au programme et au niveau de l’inscription.'
        using errcode = '23514', hint = 'egc.group_mismatch';
    end if;
    if e.group_id is not distinct from p_group then return e.id; end if;
    v_year := coalesce(e.school_year, nullif(btrim(p_school_year), ''), academic_security.school_year_of(g.annee));
    if e.status in ('Confirmed','Validated','Trial') and not academic_security.valid_school_year(v_year) then
      raise exception 'Année scolaire requise pour cette affectation.' using errcode = '22023', hint = 'egc.school_year_required';
    end if;
  end if;
  -- I6: capacity, overridable by director/admin with a reason (D4-A).
  if not online_security.is_online_type(g.session_type) and g.capacite_max is not null then
    perform pg_advisory_xact_lock(hashtextextended('group:seats:' || p_group::text, 0));
    v_full := academic_security.seats_taken(p_group, p_student) >= g.capacite_max;
    if v_full and v_reason is null then
      raise exception 'Ce groupe est complet.' using errcode = '23514', hint = 'egc.capacity';
    end if;
    if v_full and (coalesce(public.get_my_role(), '') not in ('director','admin') or char_length(v_reason) > 200) then
      raise exception 'Seule la direction peut dépasser la capacité, avec un motif de 200 caractères au plus.'
        using errcode = '42501', hint = 'egc.capacity_override_forbidden';
    end if;
  end if;
  v_flag := academic_security.set_flag('eh.capacity_override', case when v_full then 'on' else '' end);
  begin
    if e.id is not null then
      update public.enrollments set group_id = p_group, session_type = g.session_type,
        level = case when e.group_id is null then coalesce(e.level, g.niveau) else g.niveau end, school_year = v_year
      where id = e.id returning id into v_id;
    else
      insert into public.enrollments(student_id, group_id, status, level, session_type, school_year, date_inscription)
      values (p_student, p_group, 'Validated', g.niveau, g.session_type, v_year, academic_security.today())
      returning id into v_id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  perform academic_security.set_flag('eh.capacity_override', v_flag);
  if v_full then
    perform academic_security.log('capacity_override', v_id, p_student, p_group, jsonb_build_object('reason', btrim(v_reason)));
  end if;
  return v_id;
end $$;

-- 074 semantics on exactly one membership: Validated → Confirmed, Trial → Under Review.
-- Explicit removal of a dossier-only placement before M2: clears the file group
-- when it is that group (the sync's own write path), then resyncs without a
-- forced downgrade, so the status is kept.
create function academic_security.clear_file_group(p_student uuid, p_group uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_flag text;
begin
  if exists (select 1 from public.students s where s.id = p_student and s.groupe_id is not distinct from p_group)
     and not academic_security.is_group_member(p_student, p_group) then
    v_flag := academic_security.set_flag('eh.membership_sync', 'on');
    update public.students set groupe_id = null where id = p_student;
    perform academic_security.set_flag('eh.membership_sync', v_flag);
  end if;
  perform public.sync_student_from_enrollments(p_student, false, null);
end $$;

create function academic_security.remove(p_student uuid, p_group uuid, p_enrollment uuid,
  p_student_updated_at timestamptz, p_enrollment_updated_at timestamptz, p_require_fresh boolean)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare s public.students; e public.enrollments; v_ids uuid[];
begin
  s := academic_security.lock_learner(p_student, p_student_updated_at, p_require_fresh);
  if p_enrollment is not null then
    select * into e from public.enrollments where id = p_enrollment for update;
    if not found or e.student_id is distinct from p_student or (p_require_fresh
        and (p_enrollment_updated_at is null or e.updated_at is distinct from p_enrollment_updated_at)) then
      perform academic_security.stale();
    end if;
    if e.group_id is distinct from p_group or e.status not in ('Validated','Trial') then
      raise exception 'Cette inscription n’est pas dans ce groupe.' using errcode = '23514', hint = 'egc.not_a_member';
    end if;
  else
    select array_agg(x.id order by x.id) into v_ids from public.enrollments x
    where x.student_id = p_student and x.group_id = p_group and x.status in ('Validated','Trial');
    if cardinality(v_ids) > 1 then
      raise exception 'Sélectionnez l’inscription à retirer.' using errcode = '23514', hint = 'egc.select_enrollment';
    end if;
    if v_ids is null then
      -- M1 transition: an explicit removal of a dossier-only placement (no
      -- enrollment) leaves the file; the status is kept, as in 074.
      perform academic_security.clear_file_group(p_student, p_group);
      return null;
    end if;
    select * into e from public.enrollments where id = v_ids[1] for update;
  end if;
  update public.enrollments set group_id = null,
    status = case when status = 'Trial' then 'Under Review' else 'Confirmed' end
  where id = e.id;
  return e.id;
end $$;

-- Ends one active enrollment; its group moves to ended_group_id. The caller
-- holds the learner lock.
create function academic_security.end_enrollment(p_enrollment uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_flag text; v_done boolean;
begin
  v_flag := academic_security.set_flag('eh.enrollment_command', 'on');
  update public.enrollments set status = 'Ended', ended_at = now(), ended_by = auth.uid(),
    end_reason = btrim(p_reason), ended_group_id = group_id, group_id = null
  where id = p_enrollment and status in ('Submitted','Under Review','Confirmed','Validated','Trial');
  v_done := found;
  perform academic_security.set_flag('eh.enrollment_command', v_flag);
  return v_done;
end $$;

-- Leaver core (end_learner, close_school_year, archive, online close, clean-up):
-- ends the selected active enrollments (default all); when none remains, the
-- file becomes Alumni or Inactive and leaves its file group. Charges, receipts
-- and attendance are never touched.
-- Before M2 (owner decision 1), a dossier-only file group not backed by a
-- membership counts as an active placement: ending the learner's enrollments
-- keeps it and the status, so no M1 path unplaces a learner silently. Only an
-- explicit leaver of a file with nothing else to end, or the archive
-- (p_keep_file_group false), ends the file itself. After M2 no such group exists.
create function academic_security.leave(p_student uuid, p_final_status text, p_reason text, p_enrollments uuid[],
  p_keep_file_group boolean default true)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_id uuid; v_count integer := 0; v_remaining boolean; v_flag text;
begin
  if p_final_status not in ('Alumni','Inactive') then
    raise exception 'Statut final : Ancien apprenant ou Inactif.' using errcode = '22023', hint = 'egc.final_status_invalid';
  end if;
  if not academic_security.valid_reason(p_reason) then
    raise exception 'Motif requis (200 caractères au plus).' using errcode = '22023', hint = 'egc.reason_required';
  end if;
  perform 1 from public.students where id = p_student for update;
  if not found then perform academic_security.stale(); end if;
  if p_enrollments is not null and exists (select 1 from unnest(p_enrollments) u(id) where not exists (
      select 1 from public.enrollments x where x.id = u.id and x.student_id = p_student
        and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial'))) then
    perform academic_security.stale();
  end if;
  v_remaining := p_enrollments is not null and exists (select 1 from public.enrollments x where x.student_id = p_student
    and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial') and x.id <> all(p_enrollments));
  if p_keep_file_group and exists (select 1 from public.students s where s.id = p_student and s.groupe_id is not null
        and not academic_security.is_group_member(p_student, s.groupe_id))
     and exists (select 1 from public.enrollments x where x.student_id = p_student
        and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
        and (p_enrollments is null or x.id = any(p_enrollments))) then
    v_remaining := true;
  end if;
  if not v_remaining then v_flag := academic_security.set_flag('eh.leaver_status', p_final_status); end if;
  for v_id in select x.id from public.enrollments x where x.student_id = p_student
      and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      and (p_enrollments is null or x.id = any(p_enrollments))
      order by x.id for update loop
    if academic_security.end_enrollment(v_id, p_reason) then v_count := v_count + 1; end if;
  end loop;
  if not v_remaining then
    -- Also for a file without any enrollment to end; the file group goes too.
    perform public.sync_student_from_enrollments(p_student, true,
      (select s.groupe_id from public.students s where s.id = p_student));
    perform academic_security.set_flag('eh.leaver_status', v_flag);
  end if;
  return v_count;
end $$;

-- ── Commands (D-4) ────────────────────────────────────────────────────────
create function public.place_learner_in_group(p_student uuid, p_group uuid, p_student_updated_at timestamptz,
  p_enrollment uuid default null, p_school_year text default null, p_enrollment_updated_at timestamptz default null,
  p_capacity_override_reason text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform operational_security.require_capability('assign_group');
  return academic_security.place(p_student, p_group, p_enrollment, p_school_year, p_student_updated_at,
    p_enrollment_updated_at, p_capacity_override_reason, true);
end $$;

create function public.remove_learner_from_group(p_student uuid, p_group uuid, p_student_updated_at timestamptz,
  p_enrollment uuid default null, p_enrollment_updated_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform operational_security.require_capability('assign_group');
  return academic_security.remove(p_student, p_group, p_enrollment, p_student_updated_at, p_enrollment_updated_at, true);
end $$;

create function public.end_learner(p_student uuid, p_student_updated_at timestamptz, p_final_status text,
  p_reason text, p_enrollments uuid[] default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare s public.students; v_count integer;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  s := academic_security.lock_learner(p_student, p_student_updated_at, true);
  v_count := academic_security.leave(p_student, p_final_status, p_reason, p_enrollments);
  perform academic_security.log('leaver', null, p_student, null,
    jsonb_build_object('reason', btrim(p_reason), 'final_status', p_final_status, 'ended', v_count));
  select * into s from public.students where id = p_student;
  return jsonb_build_object('ended', v_count, 'status', s.status, 'updated_at', s.updated_at,
    'open_balance', (select coalesce(sum(c.balance), 0) from public.charge_balances c
      where c.student_id = p_student and c.voided_at is null and c.balance > 0));
end $$;

create function public.close_school_year(p_school_year text, p_expected_count integer, p_reason text)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_count integer; v_student uuid; v_ended integer := 0;
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
  select count(*) into v_count from public.enrollments e
  where e.school_year = p_school_year and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial');
  if v_count is distinct from p_expected_count then perform academic_security.stale(); end if;
  for v_student in select distinct e.student_id from public.enrollments e
      where e.school_year = p_school_year and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      order by 1 loop
    v_ended := v_ended + academic_security.leave(v_student, 'Alumni', p_reason, array(select e.id from public.enrollments e
      where e.student_id = v_student and e.school_year = p_school_year
        and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')));
  end loop;
  perform academic_security.log('close_school_year', null, null, null,
    jsonb_build_object('school_year', p_school_year, 'ended', v_ended, 'reason', btrim(p_reason)));
  -- The number of enrollments actually ended.
  return v_ended;
end $$;

create function public.reopen_enrollment(p_enrollment uuid, p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare e public.enrollments; v_student uuid; v_flag text; v_constraint text;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select x.student_id into v_student from public.enrollments x where x.id = p_enrollment;
  if not found then perform academic_security.stale(); end if;
  perform academic_security.lock_learner(v_student, null, false);
  select * into e from public.enrollments where id = p_enrollment for update;
  if not found or p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at then
    perform academic_security.stale();
  end if;
  if e.status is distinct from 'Ended' then
    raise exception 'Seule une inscription terminée peut être rouverte.' using errcode = '23514', hint = 'egc.not_ended';
  end if;
  if e.session_type is null or e.school_year is null then
    raise exception 'Programme et année scolaire requis pour rouvrir cette inscription.'
      using errcode = '22023', hint = 'egc.programme_required';
  end if;
  if exists (select 1 from public.enrollments x where x.student_id = e.student_id and x.id <> e.id
      and x.session_type = e.session_type and x.school_year = e.school_year and x.status not in ('Rejected','Ended')) then
    perform academic_security.duplicate();
  end if;
  v_flag := academic_security.set_flag('eh.enrollment_command', 'on');
  begin
    update public.enrollments set status = 'Confirmed', group_id = null, ended_at = null, ended_by = null,
      end_reason = null, ended_group_id = null
    where id = e.id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  perform academic_security.set_flag('eh.enrollment_command', v_flag);
  perform academic_security.log('reopen', e.id, e.student_id, null, null);
  return e.id;
end $$;

create function public.restore_student(p_student uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare s public.students;
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select * into s from public.students where id = p_student and deleted_at is not null for update;
  if not found then perform academic_security.stale(); end if;
  update public.students set deleted_at = null where id = p_student;
  -- Enrollments stay Ended; status and main group are recomputed (normally
  -- Inactive, no group).
  perform public.sync_student_from_enrollments(p_student, true, s.groupe_id);
  select * into s from public.students where id = p_student;
  return jsonb_build_object('id', s.id, 'status', s.status, 'updated_at', s.updated_at);
end $$;

create function public.list_archived_students(p_page integer default 1, p_page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 100 then
    raise exception 'Invalid archive page request' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'full_name', x.full_name, 'deleted_at', x.deleted_at)
        order by x.deleted_at desc, x.id)
      from (select s.id, s.full_name, s.deleted_at from public.students s where s.deleted_at is not null
        order by s.deleted_at desc, s.id limit p_page_size offset (p_page - 1) * p_page_size) x), '[]'::jsonb),
    'count', (select count(*) from public.students s where s.deleted_at is not null));
end $$;

-- ACA-5: admin enrollment creation and edits, allow-listed fields only. Group
-- changes go through placement; Confirmed, Validated (without a group) and
-- Ended transitions only through payment, placement and the leaver commands.
create function public.create_enrollment(p_student uuid, p_changes jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_status text; v_session text; v_year text; v_level text; v_id uuid; v_constraint text;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform operational_security.assert_keys(p_changes, array['status','level','date_inscription','notes','session_type','school_year']);
  perform academic_security.lock_learner(p_student, null, false);
  v_status := coalesce(nullif(p_changes->>'status', ''), 'Submitted');
  v_session := nullif(p_changes->>'session_type', '');
  v_year := nullif(p_changes->>'school_year', '');
  v_level := nullif(p_changes->>'level', '');
  if v_status not in ('Submitted','Under Review') then
    raise exception 'Une nouvelle inscription est soumise ou en cours d’examen ; l’essai et la validation passent par le groupe.'
      using errcode = '22023', hint = 'egc.status_not_permitted';
  end if;
  if v_session is null or operational_security.valid_session_level(v_session, null) is not true
     or not academic_security.valid_school_year(v_year) then
    raise exception 'Programme et année scolaire requis.' using errcode = '22023', hint = 'egc.programme_required';
  end if;
  if operational_security.valid_session_level(v_session, v_level) is not true then
    raise exception 'Niveau incompatible avec le programme.' using errcode = '22023', hint = 'egc.level_invalid';
  end if;
  if char_length(coalesce(p_changes->>'notes', '')) > 2000 then
    raise exception 'Notes trop longues.' using errcode = '22023';
  end if;
  if exists (select 1 from public.enrollments x where x.student_id = p_student and x.session_type = v_session
      and x.school_year = v_year and x.status not in ('Rejected','Ended')) then
    perform academic_security.duplicate();
  end if;
  begin
    insert into public.enrollments(student_id, status, session_type, school_year, level, date_inscription, notes)
    values (p_student, v_status, v_session, v_year, v_level,
      coalesce(nullif(p_changes->>'date_inscription', '')::date, academic_security.today()), nullif(p_changes->>'notes', ''))
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  return v_id;
end $$;

create function public.save_enrollment_changes(p_enrollment uuid, p_expected_updated_at timestamptz, p_changes jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare e public.enrollments; g public.groups; v_student uuid; v_status text; v_session text; v_year text;
  v_level text; v_constraint text;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform operational_security.assert_keys(p_changes, array['status','level','date_inscription','notes','session_type','school_year']);
  if p_changes = '{}'::jsonb then raise exception 'Aucune modification.' using errcode = '22023'; end if;
  select x.student_id into v_student from public.enrollments x where x.id = p_enrollment;
  if not found then perform academic_security.stale(); end if;
  perform academic_security.lock_learner(v_student, null, false);
  select * into e from public.enrollments where id = p_enrollment for update;
  if not found or p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at then
    perform academic_security.stale();
  end if;
  if e.status = 'Ended' and exists (select 1 from jsonb_object_keys(p_changes) k where k <> 'notes') then
    raise exception 'Une inscription terminée ne se modifie que par ses notes.' using errcode = '23514', hint = 'egc.ended_read_only';
  end if;
  v_status := case when p_changes ? 'status' then p_changes->>'status' else e.status end;
  v_session := case when p_changes ? 'session_type' then nullif(p_changes->>'session_type', '') else e.session_type end;
  v_year := case when p_changes ? 'school_year' then nullif(p_changes->>'school_year', '') else e.school_year end;
  v_level := case when p_changes ? 'level' then nullif(p_changes->>'level', '') else e.level end;
  if v_status is distinct from e.status then
    if e.status in ('Confirmed','Validated') or v_status not in ('Submitted','Under Review','Trial','Rejected','Validated') then
      raise exception 'Ce changement de statut passe par le paiement, l’affectation ou « Ancien apprenant ».'
        using errcode = '23514', hint = 'egc.status_not_permitted';
    end if;
    if v_status in ('Trial','Validated') and e.group_id is null then
      raise exception 'Affectez d’abord un groupe.' using errcode = '23514', hint = 'egc.group_required';
    end if;
  end if;
  if (e.session_type is not null and v_session is distinct from e.session_type)
     or (e.school_year is not null and v_year is distinct from e.school_year) then
    raise exception 'Le programme et l’année scolaire ne changent plus une fois fixés.' using errcode = '23514', hint = 'egc.programme_fixed';
  end if;
  if (v_session is not null and operational_security.valid_session_level(v_session, v_level) is not true)
     or (v_year is not null and not academic_security.valid_school_year(v_year)) then
    raise exception 'Programme, niveau ou année scolaire invalide.' using errcode = '22023', hint = 'egc.level_invalid';
  end if;
  if e.group_id is not null then
    select * into g from public.groups where id = e.group_id for share;
    if (v_session is not null and v_session is distinct from g.session_type)
       or (v_level is not null and v_level is distinct from g.niveau) then
      raise exception 'Le groupe doit correspondre au programme et au niveau de l’inscription.'
        using errcode = '23514', hint = 'egc.group_mismatch';
    end if;
  end if;
  if v_status not in ('Rejected','Ended') and v_session is not null and v_year is not null and exists (
      select 1 from public.enrollments x where x.student_id = e.student_id and x.id <> e.id
        and x.session_type = v_session and x.school_year = v_year and x.status not in ('Rejected','Ended')) then
    perform academic_security.duplicate();
  end if;
  begin
    update public.enrollments set status = v_status, session_type = v_session, school_year = v_year, level = v_level,
      date_inscription = case when p_changes ? 'date_inscription' then nullif(p_changes->>'date_inscription', '')::date else date_inscription end,
      notes = case when p_changes ? 'notes' then nullif(p_changes->>'notes', '') else notes end
    where id = e.id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  return e.id;
end $$;

-- Caller-rights readers: the groups of which the caller's own learners are
-- members (parents and students); empty for staff without linked learners.
create function public.my_member_group_ids() returns setof uuid
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select distinct e.group_id from public.enrollments e join public.students s on s.id = e.student_id
  where e.student_id in (select public.get_visible_student_ids()) and e.status in ('Validated','Trial')
    and e.group_id is not null and s.deleted_at is null
$$;

-- ── Re-created from their latest definitions ──────────────────────────────
-- 041 + EGC (ACA-8, I8): active enrollments end in the same transaction.
create or replace function public.soft_delete_student(p_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null
     or (public.get_my_role() in ('admin', 'director')) is not true then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform 1 from public.students where id = p_student_id and deleted_at is null for update;
  if found then
    perform academic_security.leave(p_student_id, 'Inactive', 'Dossier archivé', null, false);
  end if;
  update public.students set deleted_at = now()
    where id = p_student_id and deleted_at is null;
end;
$function$;

-- 074 + EGC: SECURITY DEFINER compatibility wrapper of remove_learner_from_group
-- (same role check), kept until the application no longer calls it.
create or replace function public.remove_student_group(p_student uuid,p_group uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_id uuid;
begin
  perform operational_security.require_capability('assign_group');
  perform academic_security.lock_learner(p_student, null, false);
  for v_id in select e.id from public.enrollments e where e.student_id=p_student and e.group_id=p_group
      and e.status in ('Validated','Trial') order by e.id loop
    perform academic_security.remove(p_student, p_group, v_id, null, null, false);
  end loop;
  perform academic_security.clear_file_group(p_student, p_group);
end;
$$;
revoke all on function public.remove_student_group(uuid,uuid) from public,anon;
grant execute on function public.remove_student_group(uuid,uuid) to authenticated;

-- 119 + EGC (DAT-2): a call without an enrollment creates or uses one through
-- the placement core instead of writing the file group; the dossier
-- session/level match is replaced by the core's enrollment/group match (DAT-1).
CREATE OR REPLACE FUNCTION public.assign_receptionist_student_group(p_student uuid, p_enrollment uuid, p_group uuid, p_student_updated_at timestamp with time zone, p_enrollment_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype;
begin
  perform operational_security.require_receptionist();
  select * into s from public.students where id=p_student and deleted_at is null for update;
  if not found or p_student_updated_at is null or s.updated_at is distinct from p_student_updated_at then
    raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
  if p_group is not null then
    select * into g from public.groups where id=p_group for share;
    if not found then raise exception 'Group unavailable' using errcode='23514'; end if;
  end if;
  if p_enrollment is null then
    if p_group is null then
      if s.groupe_id is null then return null; end if;
      return academic_security.remove(p_student,s.groupe_id,null,null,null,false);
    end if;
    return academic_security.place(p_student,p_group,null,null,null,null,null,false);
  end if;
  select * into e from public.enrollments where id=p_enrollment and student_id=p_student for update;
  if not found or p_enrollment_updated_at is null or e.updated_at is distinct from p_enrollment_updated_at then
    raise exception 'Enrollment unavailable or stale' using errcode='PT409'; end if;
  if p_group is null then
    if e.group_id is null then return e.id; end if;
    if e.status in ('Validated','Trial') then
      perform academic_security.remove(p_student,e.group_id,e.id,null,null,false);
    elsif e.status in ('Submitted','Under Review') then
      perform public.save_receptionist_enrollment(p_student,e.id,null,e.status,e.level,
        e.date_inscription,e.notes,e.session_type,e.school_year);
    else raise exception 'Removal unavailable' using errcode='42501'; end if;
    return e.id;
  end if;
  return academic_security.place(p_student,p_group,e.id,null,null,null,null,false);
end $function$;

-- 119 + EGC (D3-A): reception creates files as Prospect.
CREATE OR REPLACE FUNCTION public.save_receptionist_student(p_student uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.students%rowtype; begin
  perform operational_security.require_receptionist();
  if p_student is null then raise exception 'Stable student id required' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone','email',
      'parent_email','age_category','notes','session_type','niveau_cefr','referral_source','photo_url']);
    if nullif(btrim(p_changes->>'full_name'),'') is null then raise exception 'Name required' using errcode='22023'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau_cefr') is not true then
      raise exception 'Invalid session/level' using errcode='22023'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    insert into public.students(id,full_name,date_naissance,telephone,email,parent_email,age_category,
      notes,session_type,niveau_cefr,referral_source,photo_url,status,plan_type)
    values(p_student,p_changes->>'full_name',(p_changes->>'date_naissance')::date,p_changes->>'telephone',
      p_changes->>'email',p_changes->>'parent_email',p_changes->>'age_category',p_changes->>'notes',
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau_cefr',p_changes->>'referral_source',
      p_changes->>'photo_url','Prospect','Standard') on conflict on constraint students_pkey do nothing
    returning students.id,students.updated_at into id,updated_at;
    if id is null then
      select * into s from public.students where students.id=p_student for update;
      if s.deleted_at is not null or s.status is distinct from 'Prospect' or s.plan_type is distinct from 'Standard' or
        s.full_name is distinct from p_changes->>'full_name' or
        s.date_naissance is distinct from (p_changes->>'date_naissance')::date or
        s.telephone is distinct from p_changes->>'telephone' or
        s.email is distinct from p_changes->>'email' or s.parent_email is distinct from p_changes->>'parent_email' or
        s.age_category is distinct from p_changes->>'age_category' or s.notes is distinct from p_changes->>'notes' or
        s.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        s.niveau_cefr is distinct from p_changes->>'niveau_cefr' or
        s.referral_source is distinct from p_changes->>'referral_source' or
        s.photo_url is distinct from p_changes->>'photo_url' then
        raise exception 'Student create identity conflict' using errcode='23505'; end if;
      id:=s.id; updated_at:=s.updated_at;
    end if;
  else
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone',
      'age_category','notes','photo_url']);
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into s from public.students where students.id=p_student and deleted_at is null for update;
    if not found or s.updated_at is distinct from p_expected_updated_at then
      raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    update public.students set
      full_name=case when p_changes ? 'full_name' then p_changes->>'full_name' else s.full_name end,
      date_naissance=case when p_changes ? 'date_naissance' then (p_changes->>'date_naissance')::date else s.date_naissance end,
      telephone=case when p_changes ? 'telephone' then p_changes->>'telephone' else s.telephone end,
      age_category=case when p_changes ? 'age_category' then p_changes->>'age_category' else s.age_category end,
      notes=case when p_changes ? 'notes' then p_changes->>'notes' else s.notes end,
      photo_url=case when p_changes ? 'photo_url' then p_changes->>'photo_url' else s.photo_url end
    where students.id=p_student returning students.id,students.updated_at into id,updated_at;
  end if;
  return next;
end $function$;

-- 117 + EGC (I3): the duplicate pre-check, and a concurrent duplicate re-raised
-- as PT409 egc.duplicate_enrollment. The group assignment passes through the
-- capacity trigger like every path.
CREATE OR REPLACE FUNCTION public.save_receptionist_enrollment(p_student uuid, p_enrollment uuid DEFAULT NULL::uuid, p_group uuid DEFAULT NULL::uuid, p_status text DEFAULT 'Submitted'::text, p_level text DEFAULT NULL::text, p_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text, p_session text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype;
  result uuid; effective_session text; effective_level text; effective_year text; v_constraint text;
begin
  perform operational_security.require_receptionist();
  select * into s from public.students where id=p_student and deleted_at is null for update;
  if not found then raise exception 'Student unavailable' using errcode='23514'; end if;
  if p_enrollment is not null then
    select * into e from public.enrollments where id=p_enrollment for update;
    if not found or e.student_id is distinct from p_student then
      raise exception 'Enrollment unavailable' using errcode='23514'; end if;
  end if;
  if e.id is not null and (
    (e.session_type is not null and p_session is not null and p_session<>e.session_type) or
    (e.school_year is not null and p_school_year is not null and p_school_year<>e.school_year)) then
    raise exception 'Existing enrollment session/year is immutable' using errcode='42501'; end if;
  effective_session:=coalesce(e.session_type,p_session,s.session_type);
  effective_year:=coalesce(e.school_year,p_school_year);
  effective_level:=coalesce(p_level,e.level,case
    when operational_security.valid_session_level(effective_session,s.niveau_cefr)
    then s.niveau_cefr end);
  if effective_session not in ('Yearly','Adults','Summer Camp','Communication Junior',
      'Communication Adult','One-to-One','Mise à niveau','Other','Online','Online One-to-One') or
    (effective_year is not null and effective_year !~ '^[0-9]{4}/[0-9]{4}$') then
    raise exception 'Invalid enrollment session/year' using errcode='22023'; end if;
  if operational_security.valid_session_level(effective_session,effective_level) is not true then
    raise exception 'Invalid enrollment session/level' using errcode='23514'; end if;
  if p_group is not null then
    select * into g from public.groups where id=p_group for share;
    if not found or g.session_type is distinct from effective_session then
      raise exception 'Enrollment group must match its session and level' using errcode='23514'; end if;
    effective_level:=coalesce(effective_level,g.niveau);
    if g.niveau is distinct from effective_level then
      raise exception 'Enrollment group must match its session and level' using errcode='23514'; end if;
  end if;
  if effective_year is not null and exists(select 1 from public.enrollments x where x.student_id=p_student
    and x.session_type=effective_session and x.school_year=effective_year and x.status not in ('Rejected','Ended')
    and x.id is distinct from e.id) then
    perform academic_security.duplicate(); end if;
  begin
  if e.status in ('Confirmed','Validated') then
    if p_group is null or p_status not in ('Confirmed','Validated') then
      raise exception 'Only group assignment is permitted' using errcode='42501'; end if;
    update public.enrollments set group_id=p_group,level=effective_level,
      session_type=effective_session,status='Validated'
    where id=e.id returning id into result;
  else
    if p_status is null or p_status not in ('Submitted','Under Review','Trial') or
      (p_enrollment is not null and e.status not in ('Submitted','Under Review','Trial')) then
      raise exception 'Only operational pre-enrollment is permitted' using errcode='42501'; end if;
    if p_enrollment is null then
      insert into public.enrollments(student_id,group_id,status,level,date_inscription,notes,session_type,school_year)
      values(p_student,p_group,p_status,effective_level,p_date,p_notes,effective_session,effective_year)
      returning id into result;
    else
      update public.enrollments set group_id=p_group,status=p_status,level=effective_level,
        session_type=effective_session,school_year=effective_year,date_inscription=p_date,notes=p_notes
      where id=e.id returning id into result;
    end if;
  end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  return result;
end $function$;

-- 119 + EGC (D-5): no status line (D3-A; the confirmed enrollment sets it);
-- the implicit branch reuses the learner's single matching active enrollment;
-- the CRM guard ignores Ended; an ended enrollment keeps its state; the learner
-- is locked before any enrollment read (shared lock order).
CREATE OR REPLACE FUNCTION public.create_charge_payment(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_charge public.charges%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_requested_id uuid := nullif(p_payload->>'enrollment_id','')::uuid;
  v_enrollment_id uuid;
  v_prior_request public.financial_requests%rowtype;
  v_crm_matches integer;
  v_matches uuid[];
  v_year text;
  v_constraint text;
begin
  -- Same staff boundary as the inner financial command; never trust caller roles.
  perform operational_security.require_capability('manage_finance_operations');
  -- Payments share this lock with other payments, preserving the existing
  -- financial idempotency/charge serialization. CRM linkage takes it exclusively.
  if nullif(p_payload->>'student_id','') is not null and not pg_try_advisory_xact_lock_shared(
    hashtextextended('crm:enrollment-intent:'||(p_payload->>'student_id')::uuid,0)) then
    raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409';
  end if;
  -- Lock before inner charge/receipt foreign-key reads to avoid lock upgrades
  -- between simultaneous payments for the same student. Existing locks remain.
  perform 1 from public.students where id=nullif(p_payload->>'student_id','')::uuid for update;
  -- The inner function enforces staff authorization, payment validation and
  -- idempotency before the wrapper makes any academic changes.
  v_result := public.create_charge_payment_financial(p_payload);
  if coalesce((v_result->>'replayed')::boolean, false) then
    select * into v_prior_request from public.financial_requests
    where idempotency_key = (p_payload->>'idempotency_key')::uuid;
    if v_prior_request.requested_enrollment_id is distinct from v_requested_id then
      raise exception 'Idempotency key conflict: selected enrollment changed.';
    end if;
    return v_result;
  end if;
  update public.financial_requests set requested_enrollment_id = v_requested_id
  where idempotency_key = (p_payload->>'idempotency_key')::uuid;
  if (v_result->>'receipt_id') is null then
    return v_result;
  end if;

  select * into v_charge from public.charges
  where id = (v_result->>'charge_id')::uuid for update;
  if nullif(p_payload->>'student_id','') is null then
    update public.students set session_type = v_charge.session_type,
      niveau_cefr = coalesce(v_charge.level, niveau_cefr)
    where id = v_charge.student_id;
  end if;
  -- EGC (D3-A, FIN-10): a receipt no longer sets the learner's status; an Other
  -- or legacy receipt changes none, a tuition receipt confirms an enrollment.
  if v_charge.session_type = 'Other' or v_charge.legacy then
    if v_requested_id is not null then
      raise exception 'This service cannot be linked to a tuition enrollment.';
    end if;
    return v_result || jsonb_build_object('student_enrolled', false);
  end if;

  -- Lock the student across different charges in the same request period.
  perform 1 from public.students where id = v_charge.student_id for update;
  if v_charge.enrollment_id is not null and v_requested_id is not null
    and v_charge.enrollment_id <> v_requested_id then
    raise exception 'Charge is already linked to another enrollment.';
  end if;
  v_enrollment_id := coalesce(v_charge.enrollment_id, v_requested_id);

  if v_enrollment_id is null then
    -- Guard only the implicit tuition-enrollment creation branch. Explicit charge
    -- or request links retain 074 validation. Exceptions roll back the entire
    -- inner financial transaction, including receipt/event/student side effects.
    select count(*) into v_crm_matches
    from public.crm_leads l join public.enrollments e on e.id=l.enrollment_id
    join public.students s on s.id=e.student_id
    where e.student_id=v_charge.student_id and s.deleted_at is null
      and e.status is distinct from 'Rejected' and e.status is distinct from 'Ended' and l.merged_into_lead_id is null
      and coalesce(e.session_type,s.session_type)=v_charge.session_type
      -- Unknown year on an old charge cannot establish a distinct intent.
      and (v_charge.school_year is null or crm_security.enrollment_year(e)=v_charge.school_year);
    if v_crm_matches>0 then
      raise exception '%',case when v_crm_matches=1
        then 'Une inscription CRM existe pour ce programme et cette année. Sélectionnez-la avant d’enregistrer le paiement.'
        else 'Plusieurs inscriptions CRM correspondent. Sélectionnez explicitement l’inscription à payer.' end
        using errcode='22023';
    end if;
    -- EGC (D-5, I3): reuse the learner's single active enrollment of this
    -- programme and year that is not CRM-linked. An undated (pre-057) charge
    -- matches an undated enrollment or one of the current school year, which
    -- the new or confirmed enrollment receives (I9).
    v_year := coalesce(v_charge.school_year, academic_security.school_year_on(academic_security.today()));
    select array_agg(e.id order by e.id) into v_matches from public.enrollments e
    where e.student_id = v_charge.student_id and e.session_type = v_charge.session_type
      and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      and (e.school_year = v_charge.school_year
        or (v_charge.school_year is null and (e.school_year is null or e.school_year = v_year)))
      and not exists (select 1 from public.crm_leads l where l.enrollment_id = e.id);
    if cardinality(v_matches) > 1 then
      raise exception 'Plusieurs inscriptions correspondent. Sélectionnez l’inscription à payer.' using errcode='22023';
    end if;
    v_enrollment_id := v_matches[1];
  end if;

  begin
  if v_enrollment_id is not null then
    select * into v_enrollment from public.enrollments
    where id = v_enrollment_id for update;
    if not found or v_enrollment.student_id is distinct from v_charge.student_id
      or v_enrollment.status = 'Rejected'
      -- An ended enrollment only takes payments on its own charge (an old balance).
      or (v_enrollment.status = 'Ended' and v_charge.enrollment_id is distinct from v_enrollment.id)
      or (v_enrollment.session_type is not null
          and v_enrollment.session_type <> v_charge.session_type)
      or (v_enrollment.school_year is not null and v_charge.school_year is not null
          and v_enrollment.school_year <> v_charge.school_year) then
      raise exception 'Selected enrollment does not match this student, session and school year.';
    end if;
    if v_enrollment.status is distinct from 'Ended' then
      update public.enrollments set
        session_type = v_charge.session_type,
        school_year = coalesce(v_charge.school_year, v_enrollment.school_year, crm_security.enrollment_year(v_enrollment)),
        level = coalesce(v_enrollment.level, v_charge.level),
        status = case
          when status in ('Submitted','Under Review') then
            case when group_id is null then 'Confirmed' else 'Validated' end
          when status = 'Trial' then 'Validated'
          else status end
      where id = v_enrollment_id;
    end if;
  else
    insert into public.enrollments
      (student_id, status, date_inscription, session_type, school_year, level)
    values (v_charge.student_id, 'Confirmed', current_date,
            v_charge.session_type, v_year, v_charge.level)
    returning id into v_enrollment_id;
  end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;

  update public.charges set enrollment_id = v_enrollment_id
  where id = v_charge.id and enrollment_id is distinct from v_enrollment_id;
  update public.receipts set enrollment_id = v_enrollment_id
  where id = (v_result->>'receipt_id')::uuid;
  select * into v_enrollment from public.enrollments where id = v_enrollment_id;
  return v_result || jsonb_build_object('enrollment_id', v_enrollment_id,
                                       'enrollment_confirmed', v_enrollment.status in ('Confirmed','Validated'),
                                       'group_pending', v_enrollment.status = 'Confirmed' and v_enrollment.group_id is null,
                                       'student_enrolled', v_enrollment.status in ('Confirmed','Validated'));
end;
$function$;

-- 084 + EGC (D5-A): an enrollment ended from Confirmed/Validated keeps its
-- conversion (no review flag).
CREATE OR REPLACE FUNCTION crm_security.evaluate_conversion(lead uuid, happened timestamp with time zone, previous_status text DEFAULT NULL::text, evidence text DEFAULT 'linked_confirmed_enrollment'::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare l public.crm_leads%rowtype; e public.enrollments%rowtype; a uuid; t public.crm_tasks%rowtype; begin
 select * into l from public.crm_leads where id=lead for update;
 if not found or l.enrollment_id is null then return; end if;
 select * into strict e from public.enrollments where id=l.enrollment_id for update;
 if e.student_id is distinct from l.student_id then raise exception 'CRM enrollment/student mismatch' using errcode='23514'; end if;
 if l.status='CONVERTED' then
  if (e.status is null or e.status not in ('Confirmed','Validated')) and not (e.status='Ended' and previous_status in ('Confirmed','Validated'))
   and (not l.conversion_review_required or previous_status is distinct from e.status and previous_status is not null) then
   insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body,details)
   values(l.id,e.id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'conversion_review_required',
    'conversion-review:'||e.id||':'||gen_random_uuid(),'Inscription modifiée après confirmation : vérification par la direction.',
    jsonb_build_object('previous_enrollment_status',previous_status,'enrollment_status',e.status));
   update public.crm_leads set conversion_review_required=true,version=version+1,updated_at=now() where id=l.id;
  end if;
  return;
 end if;
 if e.status is null or e.status not in ('Confirmed','Validated') then return; end if;
 insert into public.crm_activities(lead_id,enrollment_id,attribution_submission_id,occurred_at,actor_id,actor_kind,event_type,source_key,from_status,to_status,body,details)
 values(l.id,e.id,l.first_submission_id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'lead_converted',
  'conversion:'||l.id||':'||e.id,l.status,'CONVERTED','Inscription confirmée.',jsonb_build_object('enrollment_status',e.status,'evidence',evidence))
 on conflict(source_key) do nothing returning id into a;
 if a is null then select id into strict a from public.crm_activities where source_key='conversion:'||l.id||':'||e.id; end if;
 update public.crm_leads set status='CONVERTED',converted_at=happened,conversion_activity_id=a,
 conversion_review_required=conversion_review_required or l.status in ('LOST','NOT_QUALIFIED'),
 closure_reason=null,closure_note=null,closed_at=null,version=version+1,updated_at=now() where id=l.id;
 -- System confirmations must work without a browser auth identity as well.
 for t in select * from public.crm_tasks where lead_id=l.id and status='open' order by id for update loop
  insert into public.crm_activities(lead_id,task_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
  values(l.id,t.id,e.id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'task_cancelled',
   'conversion-task:'||l.id||':'||t.id,'Inscription confirmée : suivi commercial terminé.');
  update public.crm_tasks set status='cancelled',cancelled_at=happened,cancelled_by=auth.uid(),
   cancellation_reason='Inscription confirmée',version=version+1,updated_at=now() where id=t.id;
 end loop;
end $function$;

-- 119 + EGC (D5-A): an ended enrollment is treated like a rejected one in the
-- three existing-enrollment checks, so a returning learner's new lead creates a
-- new enrollment.
CREATE OR REPLACE FUNCTION public.crm_start_enrollment(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; l public.crm_leads%rowtype; c public.crm_contacts%rowtype;
 s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; a uuid; t public.crm_tasks%rowtype; keep_task uuid;
 learner text; birth date; session text; year text; level text; initial_status text; due timestamptz; result jsonb;
 followup_at timestamptz; followup_task uuid; followup jsonb; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000
 or p_data-array['lead_id','expected_version','student_choice','student_id','learner_name','birth_date','candidate_review','confirm_new','enrollment_id','expected_enrollment_updated_at','session_type','school_year','level','group_id','initial_status','followup_at','notes']<>'{}'::jsonb then
  raise exception 'Valid bounded enrollment request required' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
 -- E9: hint only the helper's own lock collision, at its original position.
 -- Every other error, including a malformed student_id cast, propagates as before.
 begin
  perform crm_security.lock_enrollment_intent(nullif(p_data->>'student_id','')::uuid);
 exception when sqlstate 'PT409' then
  if sqlerrm='Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' then
   raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409',hint='crm_enrollment.enrollment_in_progress'; end if;
  raise;
 end;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':start_enrollment:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='start_enrollment' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023',hint='crm_enrollment.request_conflict'; end if;return prior.result;
 end if;
 select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
 -- E1: one reason per condition of the former combined lead check.
 if not found or l.merged_into_lead_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_unavailable'; end if;
 if l.enrollment_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_already_enrolled'; end if;
 if l.status<>'QUALIFIED' then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_not_qualified'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409',hint='crm_enrollment.lead_changed'; end if;
 select * into strict c from public.crm_contacts where id=l.contact_id;
 learner:=btrim(p_data->>'learner_name');
 -- E3: same cast at the same position; only its cast errors gain a reason.
 begin
  birth:=nullif(p_data->>'birth_date','')::date;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.birth_date_invalid';
 end;
 session:=p_data->>'session_type';year:=p_data->>'school_year';level:=nullif(p_data->>'level','');initial_status:=coalesce(p_data->>'initial_status','Submitted');
 -- E2: the former combined program/year/notes check, split in its original order.
 if session is null or session<>all(array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other','Online','Online One-to-One']) then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.program_invalid'; end if;
 if year is null or year!~'^[0-9]{4}/[0-9]{4}$' or right(year,4)::integer<>left(year,4)::integer+1 then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.school_year_invalid'; end if;
 if length(p_data->>'notes')>2000 then raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.notes_too_long'; end if;
 if initial_status not in ('Submitted','Trial') then raise exception 'Only pre-confirmation enrollment initiation is permitted' using errcode='42501',hint='crm_enrollment.initial_status_not_permitted'; end if;
 if p_data->>'student_choice'='new' then
  -- E3: the same rejected set as 084, one reason per condition. A birth date is
  -- bounded by the Casablanca civil date (enrollment initiation only).
  if l.student_id is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_already_linked'; end if;
  if p_data->>'student_id' is not null or p_data->>'enrollment_id' is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
  if learner is null or length(learner) not between 2 and 120 then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_name_invalid'; end if;
  if not isfinite(birth) then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_invalid'; end if;
  if birth>(now() at time zone 'Africa/Casablanca')::date then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_future'; end if;
  -- Serializes new-student decisions for equal names, including separate leads.
  perform pg_advisory_xact_lock(hashtextextended('crm:new-student:'||lower(learner),0));
  if p_data->>'candidate_review' is distinct from crm_security.candidate_token(l.id,learner,birth) then raise exception 'Student candidates changed; review again' using errcode='PT409',hint='crm_enrollment.candidates_changed'; end if;
  if exists(select 1 from crm_security.student_candidates(l.id,learner,birth)) and coalesce((p_data->>'confirm_new')::boolean,false) is not true then raise exception 'Explicit new learner decision required' using errcode='22023',hint='crm_enrollment.new_learner_confirmation_required'; end if;
  insert into public.students(full_name,date_naissance,telephone,email,parent_email,status,session_type,niveau_cefr,notes)
  values(learner,birth,coalesce(c.phone_e164,c.phone_raw),case when c.contact_kind='adult_learner' then c.email_normalized end,
   case when c.contact_kind<>'adult_learner' then c.email_normalized end,'Prospect',session,level,
   case when c.contact_kind<>'adult_learner' then 'Contact : '||coalesce(c.display_name,'Non renseigné') end) returning * into s;
 elsif p_data->>'student_choice'='existing' then
  select * into s from public.students where id=(p_data->>'student_id')::uuid and deleted_at is null for update;
  -- E4: the former combined check, split by linkage.
  if not found then
   if l.student_id is not null and l.student_id=(p_data->>'student_id')::uuid then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.linked_learner_unavailable'; end if;
   if l.student_id is not null then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
   raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_unavailable';
  end if;
  if l.student_id is not null and l.student_id<>s.id then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
 else raise exception 'Explicit student choice required' using errcode='22023',hint='crm_enrollment.learner_choice_required'; end if;
 if p_data->>'enrollment_id' is not null then
  select * into e from public.enrollments where id=(p_data->>'enrollment_id')::uuid for update;
  -- E5: the former combined check, split into incompatibility and linkage.
  if not found or e.student_id is distinct from s.id or e.status is null or e.status in ('Rejected','Ended')
  or coalesce(e.session_type,s.session_type) is distinct from session or crm_security.enrollment_year(e) is distinct from year then
   raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_incompatible'; end if;
  if exists(select 1 from public.crm_leads where enrollment_id=e.id) then raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_already_linked'; end if;
  if e.group_id is not null then
   select * into g from public.groups where id=e.group_id for share;
   if not found or g.session_type is distinct from session or (e.level is not null and g.niveau is distinct from e.level) then
    raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.enrollment_group_incompatible'; end if;
  end if;
  if e.updated_at is distinct from (p_data->>'expected_enrollment_updated_at')::timestamptz then raise exception 'Stale enrollment; refresh and retry' using errcode='PT409',hint='crm_enrollment.enrollment_changed'; end if;
 else
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status is null and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment status requires review' using errcode='22023',hint='crm_enrollment.existing_enrollment_needs_review'; end if;
  -- E6: same condition and message; the hint says whether any match is still selectable.
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended') and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment requires explicit selection' using errcode='22023',hint=case when exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended')
    and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year and not exists(select 1 from public.crm_leads where enrollment_id=x.id))
    then 'crm_enrollment.existing_enrollment_requires_selection' else 'crm_enrollment.existing_enrollment_linked_elsewhere' end; end if;
  if p_data->>'group_id' is not null then
   select * into g from public.groups where id=(p_data->>'group_id')::uuid for share;
   if not found or g.session_type is distinct from session or (level is not null and g.niveau is distinct from level) then raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.group_incompatible'; end if;
   level:=g.niveau;
  end if;
  if not crm_security.valid_enrollment_level(session,level) and not coalesce(g.id is not null or s.session_type=session and s.niveau_cefr=level and p_data->>'student_choice'='existing',false) then raise exception 'Invalid level for selected program' using errcode='22023',hint='crm_enrollment.level_invalid'; end if;
  -- E6: the 072 trigger's only remaining outcome for this row (23514), raised
  -- with the handler's mapped message after every earlier check has run.
  if initial_status='Trial' and g.id is null then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.trial_requires_group'; end if;
  -- EGC (I3): a concurrent duplicate on the one-live-enrollment index is a
  -- record conflict (PT409, egc.duplicate_enrollment), not a raw 23505.
  begin
   insert into public.enrollments(student_id,session_type,school_year,level,group_id,status,date_inscription,notes)
   values(s.id,session,year,level,g.id,initial_status,current_date,p_data->>'notes') returning * into e;
  exception when unique_violation then
   perform academic_security.duplicate();
  end;
 end if;
 update public.crm_leads set student_id=s.id,enrollment_id=e.id,version=version+1,updated_at=now() where id=l.id;
 insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
 values(l.id,e.id,now(),actor,'user','enrollment_started','enrollment-started:'||l.id||':'||e.id,'Inscription rattachée à l’apprenant.') returning id into a;
 perform crm_security.evaluate_conversion(l.id,statement_timestamp());
 if (select status from public.crm_leads where id=l.id)<>'CONVERTED' then
  -- Keep the earliest appropriate follow-up, cancel only redundant enrollment tasks.
  select * into t from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' order by due_at,id limit 1 for update;
  if t.id is null then
   -- E7: pre-checks logically identical to next_window and new_task, in their
   -- order; new_task still validates. An empty string stays a parse error.
   begin
    followup_at:=(p_data->>'followup_at')::timestamptz;
   exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.followup_invalid';
   end;
   if not isfinite(followup_at) then raise exception 'Finite due time required' using errcode='22023',hint='crm_enrollment.followup_invalid'; end if;
   begin
    due:=crm_security.next_window(l.followup_policy_id,coalesce(followup_at,now()+interval '1 day'));
   exception when invalid_parameter_value then
    if sqlerrm='Policy has no available calling window' then
     raise exception 'Policy has no available calling window' using errcode='22023',hint='crm_enrollment.followup_policy_unavailable'; end if;
    raise;
   end;
   if due<now() then raise exception 'Valid future task required' using errcode='22023',hint='crm_enrollment.followup_in_past'; end if;
   if l.owner_id is not null and not exists(select 1 from public.profiles where id=l.owner_id and role in ('director','admin','receptionist')) then
    raise exception 'Assignee must be operational staff' using errcode='22023',hint='crm_enrollment.owner_not_operational'; end if;
   followup_task:=crm_security.new_task(l,jsonb_build_object('task_type','enrollment_followup','due_at',due,'instructions','Finaliser l’inscription avec le parent.'),'enrollment-followup:'||l.id||':'||e.id,'enrollment');
   followup:=jsonb_build_object('id',followup_task,'created',true);
  else
   keep_task:=t.id;
   for t in select * from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' and id<>keep_task order by id for update loop
    perform crm_security.finish_task(t,true,'Suivi de cette inscription déjà prévu','enrollment-duplicate:'||e.id||':'||t.id);
   end loop;
   followup_task:=keep_task;followup:=jsonb_build_object('id',keep_task,'created',false);
  end if;
  -- E8: the created or retained task, read by id; never the loop variable.
  followup:=followup||crm_security.scheduled_civil((select due_at from public.crm_tasks where id=followup_task));
 end if;
 result:=crm_security.result(l.id,'enrollment-started:'||l.id||':'||e.id)||jsonb_build_object('enrollment',crm_security.enrollment_summary(e),'enrollment_followup',followup);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'start_enrollment',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected or unique_violation then raise exception 'Concurrent enrollment change; refresh and retry' using errcode='PT409',hint='crm_enrollment.concurrent_change';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.record_rejected';
end $function$

;

-- D8 = A: ends every active enrollment of one group through the leaver core.
-- Learners are locked in id order before their enrollments are read; the loop
-- also ends enrollments placed while it ran.
create function academic_security.end_group_enrollments(p_group uuid, p_final_status text, p_reason text)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_students uuid[]; v_student uuid; v_count integer := 0;
begin
  loop
    v_students := array(select distinct e.student_id from public.enrollments e where e.group_id = p_group
      and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial') order by 1);
    exit when cardinality(v_students) = 0;
    perform 1 from public.students s where s.id = any(v_students) order by s.id for update;
    foreach v_student in array v_students loop
      v_count := v_count + academic_security.leave(v_student, p_final_status, p_reason, array(
        select e.id from public.enrollments e where e.student_id = v_student and e.group_id = p_group
          and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')));
    end loop;
  end loop;
  return v_count;
end $$;

-- 118 + EGC (D8 = A): closing an online course ends its enrollments ("Cours en
-- ligne clôturé"; Alumni when nothing else is active), so the learner can take
-- another online course the same school year. After the first pass the course
-- takes the 117 seat lock, which every group assignment into the course takes,
-- and ends anything placed before it: no placement made during the close is
-- missed. Join, seat and capacity logic are unchanged.
CREATE OR REPLACE FUNCTION public.online_close_course(p_group uuid, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.online_courses%rowtype; v_revoked integer; v_ended integer;
begin
  perform online_security.require_role(array['director', 'admin']);
  c := online_security.course_for_update(p_group, p_expected_version);
  if c.status = 'closed' then perform online_security.fail('course_closed', '23514', 'Ce cours est déjà clôturé.'); end if;
  update public.online_courses set status = 'closed', version = version + 1, updated_at = now(), updated_by = auth.uid()
  where group_id = p_group returning * into c;
  update public.online_join_tokens t set revoked_at = now(), revoke_reason = 'course_closed'
  from public.online_lessons l
  where t.lesson_id = l.id and l.group_id = p_group and t.revoked_at is null and t.expires_at > now();
  get diagnostics v_revoked = row_count;
  v_ended := academic_security.end_group_enrollments(p_group, 'Alumni', 'Cours en ligne clôturé');
  perform pg_advisory_xact_lock(hashtextextended('online:seats:' || p_group::text, 0));
  v_ended := v_ended + academic_security.end_group_enrollments(p_group, 'Alumni', 'Cours en ligne clôturé');
  -- The opaque room reference stays on the server: the close route resolves it as the
  -- service role through online_resolve_room (migration 118, review fix N1).
  return jsonb_build_object('group_id', c.group_id, 'version', c.version, 'status', c.status, 'revoked', v_revoked,
    'ended', v_ended);
end $function$;

-- ── Data clean-up cores (separate, owner-approved Production step R4) ────
-- Run by the operator as the migration role, one transaction per stage. Each
-- stage refuses unless its live count equals the approved count, journals
-- every change in maintenance.egc_cleanup_log and can be reverted with
-- academic_security.egc_revert_cleanup(stage). Ids and statuses only.
create function academic_security.cleanup_image(p_entity text, p_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case p_entity
    when 'enrollments' then (select jsonb_build_object('status', e.status, 'group_id', e.group_id, 'session_type', e.session_type,
        'school_year', e.school_year, 'level', e.level, 'ended_at', e.ended_at, 'ended_by', e.ended_by,
        'end_reason', e.end_reason, 'ended_group_id', e.ended_group_id) from public.enrollments e where e.id = p_id)
    when 'students' then (select jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id,
        'session_type', s.session_type, 'niveau_cefr', s.niveau_cefr) from public.students s where s.id = p_id)
    when 'charges' then (select jsonb_build_object('enrollment_id', c.enrollment_id) from public.charges c where c.id = p_id)
  end
$$;
create function academic_security.cleanup_journal(p_step text, p_entity text, p_id uuid, p_before jsonb)
returns void language sql security definer set search_path = pg_catalog, pg_temp as $$
  insert into maintenance.egc_cleanup_log(step, entity, row_id, before, after)
  values (p_step, p_entity, p_id, p_before, academic_security.cleanup_image(p_entity, p_id))
$$;
create function academic_security.cleanup_expect(p_step text, p_actual integer, p_expected integer) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$ begin
  if p_actual is distinct from p_expected then
    raise exception 'EGC clean-up %: live count % differs from the approved %; stop for a new approval', p_step, p_actual, p_expected
      using errcode = 'P0001';
  end if;
end $$;
create function academic_security.cleanup_once(p_step text) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$ begin
  if exists (select 1 from maintenance.egc_cleanup_log l where l.step = p_step) then
    raise exception 'EGC clean-up %: already run; revert it first', p_step using errcode = 'P0001';
  end if;
end $$;

-- C1: back-fill a Validated enrollment for every non-archived file group that
-- is not a membership, and link the single unlinked non-legacy charge of that
-- programme and year. A learner who already holds a single Confirmed enrollment
-- of that programme and year without a group (a payment made between M1 and the
-- clean-up) has that enrollment placed instead; any other live enrollment of
-- that programme and year stops the stage for a decision.
create function academic_security.egc_cleanup_c1(p_expected integer, p_expected_links integer)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r record; v_id uuid; v_charges uuid[]; v_links integer := 0; v_count integer; v_year text; v_flag text;
  v_before jsonb; v_charge_before jsonb; v_live uuid[]; v_enrollment_before jsonb;
begin
  perform academic_security.cleanup_once('C1');
  select count(*) into v_count from public.students s where s.deleted_at is null and s.groupe_id is not null
    and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.group_id = s.groupe_id
      and e.status in ('Validated','Trial'));
  perform academic_security.cleanup_expect('C1', v_count, p_expected);
  v_flag := academic_security.set_flag('eh.capacity_override', 'on');
  for r in select s.id, s.groupe_id, s.created_at, g.session_type, g.niveau, g.annee from public.students s
      join public.groups g on g.id = s.groupe_id
      where s.deleted_at is null and not exists (select 1 from public.enrollments e where e.student_id = s.id
        and e.group_id = s.groupe_id and e.status in ('Validated','Trial'))
      order by s.id for update of s loop
    v_year := academic_security.school_year_of(r.annee);
    if v_year is null then raise exception 'EGC clean-up C1: group without a school year' using errcode = 'P0001'; end if;
    v_before := academic_security.cleanup_image('students', r.id);
    v_live := array(select e.id from public.enrollments e where e.student_id = r.id and e.session_type = r.session_type
      and e.school_year = v_year and e.status not in ('Rejected','Ended') order by e.id);
    if cardinality(v_live) = 0 then
      insert into public.enrollments(student_id, group_id, status, session_type, level, school_year, date_inscription, notes)
      values (r.id, r.groupe_id, 'Validated', r.session_type, r.niveau, v_year,
        coalesce((select min(rc.date) from public.receipts rc join public.charges c on c.id = rc.charge_id
            where rc.student_id = r.id and rc.voided_at is null and rc.deleted_at is null and c.session_type = r.session_type
              and rc.date >= make_date(left(v_year, 4)::integer, 6, 1)),
          (r.created_at at time zone 'Africa/Casablanca')::date), 'Rattrapage EGC')
      returning id into v_id;
      perform academic_security.cleanup_journal('C1', 'enrollments', v_id, null);
    elsif cardinality(v_live) = 1 and exists (select 1 from public.enrollments e where e.id = v_live[1]
        and e.status = 'Confirmed' and e.group_id is null and (e.level is null or e.level = r.niveau)) then
      v_id := v_live[1];
      v_enrollment_before := academic_security.cleanup_image('enrollments', v_id);
      -- Confirmed plus a group becomes Validated (072 trigger).
      update public.enrollments set group_id = r.groupe_id, level = coalesce(level, r.niveau) where id = v_id;
      perform academic_security.cleanup_journal('C1', 'enrollments', v_id, v_enrollment_before);
    else
      raise exception 'EGC clean-up C1: a learner with an unbacked file group already holds another live % % enrollment that cannot be placed; stop for a decision',
        r.session_type, v_year using errcode = 'P0001';
    end if;
    v_charges := array(select c.id from public.charges c where c.student_id = r.id and c.voided_at is null and not c.legacy
      and c.session_type = r.session_type and c.school_year = v_year and c.enrollment_id is null order by c.id);
    if cardinality(v_charges) > 1 then
      raise exception 'EGC clean-up C1: a learner has more than one candidate charge' using errcode = 'P0001';
    end if;
    if cardinality(v_charges) = 1 then
      v_charge_before := academic_security.cleanup_image('charges', v_charges[1]);
      update public.charges set enrollment_id = v_id where id = v_charges[1];
      perform academic_security.cleanup_journal('C1', 'charges', v_charges[1], v_charge_before);
      v_links := v_links + 1;
    end if;
    perform academic_security.cleanup_journal('C1', 'students', r.id, v_before);
  end loop;
  perform academic_security.set_flag('eh.capacity_override', v_flag);
  perform academic_security.cleanup_expect('C1 charge links', v_links, p_expected_links);
  return v_count;
end $$;

-- C1b: a Confirmed/Validated/Trial enrollment with a group but no programme or
-- school year receives its group's programme and school year (I9).
create function academic_security.egc_cleanup_c1b(p_expected integer)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r record; v_count integer; v_before jsonb; v_year text;
begin
  perform academic_security.cleanup_once('C1b');
  select count(*) into v_count from public.enrollments e where e.status in ('Confirmed','Validated','Trial')
    and e.group_id is not null and (e.session_type is null or e.school_year is null);
  perform academic_security.cleanup_expect('C1b', v_count, p_expected);
  for r in select e.id, e.student_id, g.session_type, g.annee from public.enrollments e join public.groups g on g.id = e.group_id
      where e.status in ('Confirmed','Validated','Trial') and (e.session_type is null or e.school_year is null)
      order by e.student_id, e.id loop
    perform 1 from public.students where id = r.student_id for update;
    v_before := academic_security.cleanup_image('enrollments', r.id);
    v_year := coalesce((select e.school_year from public.enrollments e where e.id = r.id), academic_security.school_year_of(r.annee));
    if v_year is null then raise exception 'EGC clean-up C1b: group without a school year' using errcode = 'P0001'; end if;
    if exists (select 1 from public.enrollments e where e.student_id = r.student_id and e.id <> r.id
        and e.session_type = coalesce((select x.session_type from public.enrollments x where x.id = r.id), r.session_type)
        and e.school_year = v_year and e.status not in ('Rejected','Ended')) then
      raise exception 'EGC clean-up C1b: the learner already holds another live enrollment of that programme and school year; stop for a decision'
        using errcode = 'P0001';
    end if;
    update public.enrollments set session_type = coalesce(session_type, r.session_type), school_year = v_year where id = r.id;
    perform academic_security.cleanup_journal('C1b', 'enrollments', r.id, v_before);
  end loop;
  return v_count;
end $$;

-- C2: legacy Validated rows without a group become Ended. A learner whose file
-- holds a group must already be a member of it (C1 before C2).
create function academic_security.egc_cleanup_c2(p_expected integer)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r record; v_count integer; v_before jsonb; v_student jsonb;
begin
  perform academic_security.cleanup_once('C2');
  select count(*) into v_count from public.enrollments e where e.status = 'Validated' and e.group_id is null;
  perform academic_security.cleanup_expect('C2', v_count, p_expected);
  for r in select e.id, e.student_id, s.groupe_id, s.deleted_at from public.enrollments e
      join public.students s on s.id = e.student_id
      where e.status = 'Validated' and e.group_id is null order by e.student_id, e.id loop
    perform 1 from public.students where id = r.student_id for update;
    if r.deleted_at is null and r.groupe_id is not null
       and not academic_security.is_group_member(r.student_id, r.groupe_id) then
      raise exception 'EGC clean-up C2: the file group is not backed by a membership; run C1 first' using errcode = 'P0001';
    end if;
    v_student := academic_security.cleanup_image('students', r.student_id);
    v_before := academic_security.cleanup_image('enrollments', r.id);
    perform academic_security.end_enrollment(r.id, 'Inscription historique sans groupe');
    perform academic_security.cleanup_journal('C2', 'enrollments', r.id, v_before);
    perform academic_security.cleanup_journal('C2', 'students', r.student_id, v_student);
  end loop;
  return v_count;
end $$;

-- C3: former learners (rule F, plus the learners whose only enrollments C2
-- ended) become Alumni (D6) or Inactive. No enrollment, charge or receipt changes.
create function academic_security.egc_cleanup_c3(p_expected integer, p_final_status text default 'Alumni',
  p_receipt_since date default '2026-08-01')
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_ids uuid[]; v_id uuid; v_before jsonb;
begin
  perform academic_security.cleanup_once('C3');
  v_ids := array(select s.id from public.students s where s.deleted_at is null and s.groupe_id is null
    and (s.status in ('Enrolled','Trial','Alumni')
      or exists (select 1 from maintenance.egc_cleanup_log l join public.enrollments e on e.id = l.row_id
        where l.step = 'C2' and l.entity = 'enrollments' and e.student_id = s.id))
    and not exists (select 1 from public.enrollments e where e.student_id = s.id
      and e.status in ('Submitted','Under Review','Trial','Confirmed','Validated'))
    and not exists (select 1 from public.receipts r where r.student_id = s.id and r.voided_at is null
      and r.deleted_at is null and r.date >= p_receipt_since)
    order by s.id);
  perform academic_security.cleanup_expect('C3', cardinality(v_ids), p_expected);
  foreach v_id in array v_ids loop
    v_before := academic_security.cleanup_image('students', v_id);
    perform academic_security.leave(v_id, p_final_status, 'Ancien apprenant (clôture EGC)', null);
    perform academic_security.cleanup_journal('C3', 'students', v_id, v_before);
  end loop;
  return cardinality(v_ids);
end $$;

-- C4: archived learners keep no active enrollment (I8).
create function academic_security.egc_cleanup_c4(p_expected integer)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r record; v_count integer; v_before jsonb; v_student jsonb;
begin
  perform academic_security.cleanup_once('C4');
  select count(*) into v_count from public.enrollments e join public.students s on s.id = e.student_id
  where s.deleted_at is not null and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial');
  perform academic_security.cleanup_expect('C4', v_count, p_expected);
  for r in select e.id, e.student_id from public.enrollments e join public.students s on s.id = e.student_id
      where s.deleted_at is not null and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      order by e.student_id, e.id loop
    perform 1 from public.students where id = r.student_id for update;
    v_student := academic_security.cleanup_image('students', r.student_id);
    v_before := academic_security.cleanup_image('enrollments', r.id);
    perform academic_security.end_enrollment(r.id, 'Dossier archivé');
    perform academic_security.cleanup_journal('C4', 'enrollments', r.id, v_before);
    perform academic_security.cleanup_journal('C4', 'students', r.student_id, v_student);
  end loop;
  return v_count;
end $$;

-- C5: Mise à niveau learners paid on historical receipts get a Confirmed
-- enrollment without group or level, so they appear in "Groupe à affecter".
create function academic_security.egc_cleanup_c5(p_expected integer, p_school_year text default '2026/2027',
  p_receipt_since date default '2026-08-01')
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_ids uuid[]; v_student uuid; v_id uuid; v_before jsonb;
begin
  perform academic_security.cleanup_once('C5');
  if not academic_security.valid_school_year(p_school_year) then
    raise exception 'EGC clean-up C5: invalid school year' using errcode = 'P0001';
  end if;
  v_ids := array(select s.id from public.students s where s.deleted_at is null and s.status = 'Enrolled' and s.groupe_id is null
    and s.session_type = 'Mise à niveau'
    and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.status in ('Confirmed','Validated','Trial'))
    and exists (select 1 from public.receipts r where r.student_id = s.id and r.voided_at is null and r.deleted_at is null
      and r.date >= p_receipt_since)
    order by s.id);
  perform academic_security.cleanup_expect('C5', cardinality(v_ids), p_expected);
  foreach v_student in array v_ids loop
    perform 1 from public.students where id = v_student for update;
    if exists (select 1 from public.enrollments e where e.student_id = v_student and e.session_type = 'Mise à niveau'
        and e.school_year = p_school_year and e.status not in ('Rejected','Ended')) then
      raise exception 'EGC clean-up C5: a learner already holds a live Mise à niveau % enrollment; stop for a decision', p_school_year
        using errcode = 'P0001';
    end if;
    v_before := academic_security.cleanup_image('students', v_student);
    insert into public.enrollments(student_id, status, session_type, school_year, date_inscription, notes)
    values (v_student, 'Confirmed', 'Mise à niveau', p_school_year, academic_security.today(),
      'Rattrapage EGC: payé sur reçu historique')
    returning id into v_id;
    perform academic_security.cleanup_journal('C5', 'enrollments', v_id, null);
    perform academic_security.cleanup_journal('C5', 'students', v_student, v_before);
  end loop;
  return cardinality(v_ids);
end $$;

-- C6: the invariants M2 requires, as counts (all zero except the two totals).
create function academic_security.egc_cleanup_c6() returns jsonb
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'unbacked_file_groups', (select count(*) from public.students s where s.deleted_at is null and s.groupe_id is not null
      and not academic_security.is_group_member(s.id, s.groupe_id)),
    'active_without_group', (select count(*) from public.enrollments e where e.status in ('Validated','Trial') and e.group_id is null),
    'confirmed_without_programme', (select count(*) from public.enrollments e where e.status in ('Confirmed','Validated','Trial')
      and (e.session_type is null or e.school_year is null)),
    'ended_shape', (select count(*) from public.enrollments e where (e.status = 'Ended') <> (e.ended_at is not null)
      or (e.status = 'Ended' and e.group_id is not null)),
    'archived_with_active', (select count(*) from public.enrollments e join public.students s on s.id = e.student_id
      where s.deleted_at is not null and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')),
    'group_mismatches', (select count(*) from public.enrollments e join public.groups g on g.id = e.group_id
      where e.session_type is distinct from g.session_type or (e.level is not null and e.level is distinct from g.niveau)),
    'enrolled_or_trial', (select count(*) from public.students s where s.deleted_at is null and s.status in ('Enrolled','Trial')),
    -- I7, informational: Enrolled/Trial files their enrollments do not back (paid on
    -- historical receipts). The guard holds I7 for every change; M2 does not refuse them.
    'status_without_enrollment', (select count(*) from public.students s where s.deleted_at is null and (
      (s.status = 'Enrolled' and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.status in ('Confirmed','Validated')))
      or (s.status = 'Trial' and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.status = 'Trial')))),
    'awaiting_group', (select count(*) from public.students s where s.deleted_at is null and (
      exists (select 1 from public.enrollments e where e.student_id = s.id and e.status = 'Confirmed' and e.group_id is null)
      or (s.status in ('Enrolled','Trial') and not exists (select 1 from public.enrollments e where e.student_id = s.id
        and e.status in ('Validated','Trial') and e.group_id is not null)
        and not exists (select 1 from public.enrollments e where e.student_id = s.id
          and e.status in ('Submitted','Under Review','Confirmed'))))))
$$;

-- Reverts one stage from its journal inside the caller's transaction: rows the
-- stage inserted are deleted, enrollment and charge before-images restored in
-- reverse order with the two sync triggers off, then learner files restored
-- from their own before-images. Before-images may break the NOT VALID I1/I9
-- checks (that is what the clean-up repaired), so they are lifted for the
-- replay and added back NOT VALID; after M2 has validated them, revert M2 first.
create function academic_security.egc_revert_cleanup(p_step text)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r record; v_count integer := 0; v_sync text; v_command text; v_capacity text;
begin
  if exists (select 1 from pg_constraint c where c.conrelid = 'public.enrollments'::regclass and c.convalidated
      and c.conname in ('enrollments_active_requires_group','enrollments_confirmed_has_programme')) then
    raise exception 'EGC revert: the enforcement migration is applied; revert it first' using errcode = 'P0001';
  end if;
  -- Stages are reverted in reverse order: a later stage's journal must go first.
  if array_position(array['C1','C1b','C2','C3','C4','C5'], p_step) is null then
    raise exception 'EGC revert: unknown stage %', p_step using errcode = 'P0001';
  end if;
  if exists (select 1 from maintenance.egc_cleanup_log l
      where array_position(array['C1','C1b','C2','C3','C4','C5'], l.step) > array_position(array['C1','C1b','C2','C3','C4','C5'], p_step)) then
    raise exception 'EGC revert: a later stage is still applied; revert it first' using errcode = 'P0001';
  end if;
  alter table public.enrollments drop constraint enrollments_active_requires_group,
    drop constraint enrollments_confirmed_has_programme,
    disable trigger enrollment_student_sync_before, disable trigger enrollment_student_sync_after;
  v_sync := academic_security.set_flag('eh.membership_sync', 'on');
  v_command := academic_security.set_flag('eh.enrollment_command', 'on');
  v_capacity := academic_security.set_flag('eh.capacity_override', 'on');
  for r in select * from maintenance.egc_cleanup_log l where l.step = p_step and l.entity in ('enrollments','charges')
      order by l.id desc loop
    if r.entity = 'charges' then
      update public.charges set enrollment_id = (r.before->>'enrollment_id')::uuid where id = r.row_id;
    elsif r.before is null then
      delete from public.enrollments where id = r.row_id;
    else
      update public.enrollments set status = r.before->>'status', group_id = (r.before->>'group_id')::uuid,
        session_type = r.before->>'session_type', school_year = r.before->>'school_year', level = r.before->>'level',
        ended_at = (r.before->>'ended_at')::timestamptz, ended_by = (r.before->>'ended_by')::uuid,
        end_reason = r.before->>'end_reason', ended_group_id = (r.before->>'ended_group_id')::uuid
      where id = r.row_id;
    end if;
    v_count := v_count + 1;
  end loop;
  alter table public.enrollments enable trigger enrollment_student_sync_before, enable trigger enrollment_student_sync_after;
  for r in select * from maintenance.egc_cleanup_log l where l.step = p_step and l.entity = 'students'
      order by l.id desc loop
    update public.students set status = r.before->>'status', groupe_id = (r.before->>'groupe_id')::uuid,
      session_type = r.before->>'session_type', niveau_cefr = r.before->>'niveau_cefr'
    where id = r.row_id;
    v_count := v_count + 1;
  end loop;
  delete from maintenance.egc_cleanup_log where step = p_step;
  alter table public.enrollments add constraint enrollments_active_requires_group
      check (coalesce(status, '') not in ('Validated','Trial') or group_id is not null) not valid,
    add constraint enrollments_confirmed_has_programme
      check (coalesce(status, '') not in ('Confirmed','Validated','Trial')
        or (session_type is not null and school_year is not null)) not valid;
  perform academic_security.set_flag('eh.capacity_override', v_capacity);
  perform academic_security.set_flag('eh.enrollment_command', v_command);
  perform academic_security.set_flag('eh.membership_sync', v_sync);
  return v_count;
end $$;

-- ── Grants ────────────────────────────────────────────────────────────────
revoke all on all functions in schema academic_security from public, anon, authenticated, service_role;
do $$ declare f text; begin
  foreach f in array array[
    'public.place_learner_in_group(uuid,uuid,timestamptz,uuid,text,timestamptz,text)',
    'public.remove_learner_from_group(uuid,uuid,timestamptz,uuid,timestamptz)',
    'public.end_learner(uuid,timestamptz,text,text,uuid[])',
    'public.close_school_year(text,integer,text)',
    'public.reopen_enrollment(uuid,timestamptz)',
    'public.restore_student(uuid)',
    'public.list_archived_students(integer,integer)',
    'public.create_enrollment(uuid,jsonb)',
    'public.save_enrollment_changes(uuid,timestamptz,jsonb)',
    'public.my_member_group_ids()'] loop
    -- Signed-in staff only; the service role has no business calling them (096 pattern).
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Shared Premium workshops: flexible mixed-level cohorts with a recurring
-- one-hour weekend schedule. Existing individual Premium sessions remain as
-- legacy history; new rows may target a workshop instead of one student.

begin;

create table if not exists public.premium_groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  weekday smallint not null default 6 check (weekday in (6, 7)),
  start_time time not null,
  duration_minutes integer not null default 60 check (duration_minutes = 60),
  academic_year text,
  target_size integer not null default 5 check (target_size > 0),
  active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 2000)
);

create table if not exists public.premium_group_memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  premium_group_id uuid not null references public.premium_groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  constraint premium_membership_dates_check check (end_date is null or end_date >= start_date)
);

create unique index if not exists premium_memberships_one_active_student_idx
  on public.premium_group_memberships (student_id) where active;
create index if not exists premium_memberships_group_idx
  on public.premium_group_memberships (premium_group_id, active);
create index if not exists premium_memberships_student_history_idx
  on public.premium_group_memberships (student_id, start_date, end_date);
create index if not exists premium_groups_teacher_active_idx
  on public.premium_groups (teacher_id, active);

alter table public.premium_sessions
  add column if not exists premium_group_id uuid references public.premium_groups(id) on delete restrict;
alter table public.premium_sessions alter column student_id drop not null;
alter table public.premium_sessions drop constraint if exists premium_sessions_target_check;
alter table public.premium_sessions add constraint premium_sessions_target_check
  check (num_nonnulls(student_id, premium_group_id) = 1);
create unique index if not exists premium_sessions_one_active_group_per_week_idx
  on public.premium_sessions (premium_group_id, week_start)
  where premium_group_id is not null and status <> 'Cancelled';
create index if not exists premium_sessions_group_schedule_idx
  on public.premium_sessions (premium_group_id, scheduled_date desc)
  where premium_group_id is not null;

alter table public.premium_homework_submissions
  drop constraint if exists premium_homework_submissions_premium_session_id_key;
create unique index if not exists premium_homework_one_student_per_session_idx
  on public.premium_homework_submissions (premium_session_id, student_id);

create table if not exists public.premium_attendance (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  premium_session_id uuid not null references public.premium_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null default 'Present' check (status in ('Present', 'Absent', 'Late', 'Excused')),
  notes text check (notes is null or char_length(notes) <= 1000),
  recorded_by uuid references auth.users(id),
  unique (premium_session_id, student_id)
);

alter table public.premium_groups enable row level security;
alter table public.premium_group_memberships enable row level security;
alter table public.premium_attendance enable row level security;

create or replace function public.can_access_premium_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and (
        profile.role in ('admin', 'director')
        or (
          profile.role = 'teacher'
          and exists (
            select 1 from public.premium_groups premium_group
            where premium_group.id = p_group_id
              and premium_group.teacher_id = public.get_my_teacher_id()
          )
        )
        or (
          profile.role in ('student', 'parent')
          and exists (
            select 1 from public.premium_group_memberships membership
            where membership.premium_group_id = p_group_id
              and membership.student_id in (select public.get_visible_student_ids())
          )
        )
      )
  )
$$;

drop policy if exists "premium groups visible" on public.premium_groups;
create policy "premium groups visible" on public.premium_groups for select to authenticated
  using (public.can_access_premium_group(id));
drop policy if exists "premium groups admin write" on public.premium_groups;
create policy "premium groups admin write" on public.premium_groups for all to authenticated
  using (public.get_my_role() in ('admin', 'director'))
  with check (public.get_my_role() in ('admin', 'director'));

drop policy if exists "premium memberships visible" on public.premium_group_memberships;
create policy "premium memberships visible" on public.premium_group_memberships for select to authenticated
  using (
    public.get_my_role() in ('admin', 'director')
    or student_id in (select public.get_visible_student_ids())
    or (
      public.get_my_role() = 'teacher'
      and exists (
        select 1 from public.premium_groups premium_group
        where premium_group.id = premium_group_id
          and premium_group.teacher_id = public.get_my_teacher_id()
      )
    )
  );
drop policy if exists "premium memberships admin write" on public.premium_group_memberships;
create policy "premium memberships admin write" on public.premium_group_memberships for all to authenticated
  using (public.get_my_role() in ('admin', 'director'))
  with check (public.get_my_role() in ('admin', 'director'));

create or replace function public.guard_premium_membership()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  student_plan text;
  student_session text;
  entitlement_start date;
  entitlement_end date;
  student_deleted_at timestamptz;
begin
  if not new.active then return new; end if;
  select student.plan_type, student.session_type, student.premium_start_date,
         student.premium_end_date, student.deleted_at
    into student_plan, student_session, entitlement_start, entitlement_end, student_deleted_at
  from public.students student where student.id = new.student_id;
  if not found or student_deleted_at is not null
    or student_plan is distinct from 'Premium'
    or student_session is distinct from 'Yearly' then
    raise exception 'Only active Yearly Premium students may join a Premium workshop.';
  end if;
  if entitlement_start is not null and new.start_date < entitlement_start then
    raise exception 'Membership starts before the Premium entitlement.';
  end if;
  if entitlement_end is not null and new.start_date > entitlement_end then
    raise exception 'Membership starts after the Premium entitlement.';
  end if;
  if entitlement_end is not null and (new.end_date is null or new.end_date > entitlement_end) then
    raise exception 'Membership ends after the Premium entitlement.';
  end if;
  return new;
end;
$$;

drop trigger if exists premium_membership_guard on public.premium_group_memberships;
create trigger premium_membership_guard before insert or update on public.premium_group_memberships
for each row execute function public.guard_premium_membership();
drop trigger if exists premium_groups_set_updated_at on public.premium_groups;
create trigger premium_groups_set_updated_at before update on public.premium_groups
for each row execute function public.set_updated_at();
drop trigger if exists premium_memberships_set_updated_at on public.premium_group_memberships;
create trigger premium_memberships_set_updated_at before update on public.premium_group_memberships
for each row execute function public.set_updated_at();

create or replace function public.sync_premium_membership_entitlement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.deleted_at is not null
    or new.plan_type is distinct from 'Premium'
    or new.session_type is distinct from 'Yearly' then
    delete from public.premium_group_memberships membership
    where membership.student_id = new.id and membership.active
      and membership.start_date > current_date;
    update public.premium_group_memberships membership
    set active = false, end_date = current_date
    where membership.student_id = new.id and membership.active
      and membership.start_date <= current_date;
  elsif new.premium_end_date is not null then
    delete from public.premium_group_memberships membership
    where membership.student_id = new.id and membership.active
      and membership.start_date > new.premium_end_date;
    update public.premium_group_memberships membership
    set end_date = least(coalesce(membership.end_date, new.premium_end_date), new.premium_end_date),
        active = new.premium_end_date >= current_date
    where membership.student_id = new.id and membership.active;
  end if;
  return new;
end;
$$;

drop trigger if exists students_sync_premium_membership_entitlement on public.students;
create trigger students_sync_premium_membership_entitlement
after update of plan_type, session_type, premium_end_date, deleted_at on public.students
for each row
when (
  old.plan_type is distinct from new.plan_type
  or old.session_type is distinct from new.session_type
  or old.premium_end_date is distinct from new.premium_end_date
  or old.deleted_at is distinct from new.deleted_at
)
execute function public.sync_premium_membership_entitlement();

create or replace function public.validate_premium_session_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  student_plan text;
  entitlement_start date;
  entitlement_end date;
  student_deleted_at timestamptz;
  workshop_teacher uuid;
  workshop_active boolean;
begin
  if new.premium_group_id is not null then
    select premium_group.teacher_id, premium_group.active
      into workshop_teacher, workshop_active
    from public.premium_groups premium_group where premium_group.id = new.premium_group_id;
    if not found or workshop_active is not true then
      raise exception 'An active Premium workshop is required.';
    end if;
    new.student_id := null;
    new.teacher_id := workshop_teacher;
    new.group_id := null;
    new.duration_minutes := 60;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.student_id is not distinct from old.student_id
    and new.scheduled_date is not distinct from old.scheduled_date then
    return new;
  end if;
  select student.plan_type, student.premium_start_date,
         student.premium_end_date, student.deleted_at
    into student_plan, entitlement_start, entitlement_end, student_deleted_at
  from public.students student where student.id = new.student_id;
  if not found or student_deleted_at is not null or student_plan is distinct from 'Premium' then
    raise exception 'An active Premium student is required.';
  end if;
  if entitlement_start is not null and new.scheduled_date < entitlement_start then
    raise exception 'The session is before the Premium entitlement starts.';
  end if;
  if entitlement_end is not null and new.scheduled_date > entitlement_end then
    raise exception 'The session is after the Premium entitlement ends.';
  end if;
  return new;
end;
$$;

-- Recreate the trigger so changing a session from an individual target to a
-- workshop target (or between workshops) is validated as well.
drop trigger if exists premium_sessions_validate_entitlement on public.premium_sessions;
create trigger premium_sessions_validate_entitlement
before insert or update of student_id, premium_group_id, scheduled_date on public.premium_sessions
for each row execute function public.validate_premium_session_entitlement();

drop policy if exists "premium sessions parent read" on public.premium_sessions;
create policy "premium sessions parent read" on public.premium_sessions for select to authenticated
  using (
    public.get_my_role() = 'parent'
    and (
      student_id in (select public.get_visible_student_ids())
      or exists (
        select 1 from public.premium_group_memberships membership
        where membership.premium_group_id = premium_sessions.premium_group_id
          and membership.student_id in (select public.get_visible_student_ids())
          and membership.start_date <= premium_sessions.scheduled_date
          and (membership.end_date is null or membership.end_date >= premium_sessions.scheduled_date)
      )
    )
  );
drop policy if exists "premium sessions student read" on public.premium_sessions;
create policy "premium sessions student read" on public.premium_sessions for select to authenticated
  using (
    public.get_my_role() = 'student'
    and (
      student_id in (select public.get_visible_student_ids())
      or exists (
        select 1 from public.premium_group_memberships membership
        where membership.premium_group_id = premium_sessions.premium_group_id
          and membership.student_id in (select public.get_visible_student_ids())
          and membership.start_date <= premium_sessions.scheduled_date
          and (membership.end_date is null or membership.end_date >= premium_sessions.scheduled_date)
      )
    )
  );

create or replace function public.guard_premium_homework_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  linked_student uuid;
  linked_teacher uuid;
  linked_group uuid;
  linked_date date;
  linked_time time;
  linked_status text;
  caller_role text := public.get_my_role();
begin
  select session.student_id, session.teacher_id, session.premium_group_id,
         session.scheduled_date, session.start_time, session.status
    into linked_student, linked_teacher, linked_group, linked_date, linked_time, linked_status
  from public.premium_sessions session where session.id = new.premium_session_id;
  if not found or linked_status = 'Cancelled' then
    raise exception 'A valid Premium session is required.';
  end if;
  if linked_group is not null then
    linked_student := new.student_id;
    if not exists (
      select 1 from public.premium_group_memberships membership
      where membership.premium_group_id = linked_group
        and membership.student_id = linked_student
        and membership.start_date <= linked_date
        and (membership.end_date is null or membership.end_date >= linked_date)
    ) then
      raise exception 'The student is not a member of this Premium workshop.';
    end if;
  end if;
  new.title := btrim(new.title);
  if tg_op = 'INSERT' then
    if caller_role in ('student', 'parent')
      and linked_date + linked_time <= timezone('Africa/Casablanca', now()) then
      raise exception 'Homework must be submitted before the Premium session.';
    end if;
    new.student_id := linked_student;
    new.teacher_id := linked_teacher;
    new.status := 'Submitted';
    new.teacher_note := null;
    new.reviewed_at := null;
    new.submitted_at := now();
  elsif caller_role in ('student', 'parent') then
    if linked_date + linked_time <= timezone('Africa/Casablanca', now()) then
      raise exception 'Homework must be submitted before the Premium session.';
    end if;
    if (new.premium_session_id, new.student_id, new.teacher_id) is distinct from
       (old.premium_session_id, old.student_id, old.teacher_id) then
      raise exception 'Learners may update only their submission content.';
    end if;
    new.status := 'Submitted'; new.teacher_note := null; new.reviewed_at := null; new.submitted_at := now();
  elsif caller_role = 'teacher' then
    if (new.premium_session_id, new.student_id, new.teacher_id, new.title, new.student_note, new.file_url, new.file_name)
       is distinct from
       (old.premium_session_id, old.student_id, old.teacher_id, old.title, old.student_note, old.file_url, old.file_name) then
      raise exception 'Teachers may update only preparation fields.';
    end if;
    if new.status not in ('Reviewed', 'Prepared') then
      raise exception 'Teachers may mark homework only as Reviewed or Prepared.';
    end if;
    if new.reviewed_at is null then new.reviewed_at := now(); end if;
  end if;
  if linked_student is distinct from new.student_id or linked_teacher is distinct from new.teacher_id then
    raise exception 'Submission assignment does not match the Premium session.';
  end if;
  return new;
end;
$$;

create or replace function public.notify_premium_homework_teacher()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  teacher_email text;
  teacher_name text;
  student_name text;
begin
  select teacher.email, teacher.full_name into teacher_email, teacher_name
  from public.teachers teacher where teacher.id = new.teacher_id;
  select student.full_name into student_name
  from public.students student where student.id = new.student_id;
  if teacher_email is not null then
    insert into public.notifications (
      type, recipient_email, recipient_name, student_id, subject, message, sent
    ) values (
      'premium_homework', teacher_email, teacher_name, new.student_id,
      'Nouvelle préparation pour un atelier Premium',
      coalesce(student_name, 'Un apprenant') || ' a envoyé « ' || new.title || ' » avant son atelier Premium.',
      false
    );
  end if;
  return new;
end;
$$;

create or replace function public.reserve_premium_homework_asset(p_student_id uuid, p_premium_session_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  a public.storage_assets;
  session_student uuid;
  session_group uuid;
  session_date date;
  session_status text;
begin
  select ps.student_id, ps.premium_group_id, ps.scheduled_date, ps.status
    into session_student, session_group, session_date, session_status
  from public.premium_sessions ps where ps.id=p_premium_session_id;
  if session_status='Cancelled'
    or (session_group is null and session_student is distinct from p_student_id)
    or (session_group is not null and not exists (
      select 1 from public.premium_group_memberships membership
      where membership.premium_group_id=session_group and membership.student_id=p_student_id
        and membership.start_date<=session_date
        and (membership.end_date is null or membership.end_date>=session_date)
    ))
    or storage_security.can_write(auth.uid(),'premium_homework',p_student_id,null,null) is not true then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  insert into public.storage_assets(bucket_id,object_path,purpose,student_id,premium_session_id,uploader_id)
  values('documents','assets/'||gen_random_uuid()::text,'premium_homework',p_student_id,p_premium_session_id,auth.uid())
  returning * into a;
  return jsonb_build_object('id',a.id,'bucket',a.bucket_id,'path',a.object_path);
end $$;

create or replace function public.guard_premium_attendance()
returns trigger language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
declare session_student uuid; session_group uuid; session_date date; begin
  select student_id,premium_group_id,scheduled_date into session_student,session_group,session_date
  from public.premium_sessions where id=new.premium_session_id;
  if not found or (
    session_group is null and session_student is distinct from new.student_id
  ) or (
    session_group is not null and not exists (
      select 1 from public.premium_group_memberships membership
      where membership.premium_group_id=session_group and membership.student_id=new.student_id
        and membership.start_date<=session_date
        and (membership.end_date is null or membership.end_date>=session_date)
    )
  ) then raise exception 'Student is not on this Premium session roster.'; end if;
  if new.recorded_by is null then new.recorded_by:=auth.uid(); end if;
  return new;
end $$;

drop trigger if exists premium_attendance_guard on public.premium_attendance;
create trigger premium_attendance_guard before insert or update on public.premium_attendance
for each row execute function public.guard_premium_attendance();
drop trigger if exists premium_attendance_set_updated_at on public.premium_attendance;
create trigger premium_attendance_set_updated_at before update on public.premium_attendance
for each row execute function public.set_updated_at();

drop policy if exists "premium attendance read" on public.premium_attendance;
create policy "premium attendance read" on public.premium_attendance for select to authenticated
  using (
    public.get_my_role() in ('admin','director')
    or student_id in (select public.get_visible_student_ids())
    or (public.get_my_role()='teacher' and exists (
      select 1 from public.premium_sessions session
      where session.id=premium_session_id and session.teacher_id=public.get_my_teacher_id()
    ))
  );
drop policy if exists "premium attendance staff write" on public.premium_attendance;
create policy "premium attendance staff write" on public.premium_attendance for all to authenticated
  using (
    public.get_my_role() in ('admin','director')
    or (public.get_my_role()='teacher' and exists (
      select 1 from public.premium_sessions session
      where session.id=premium_session_id and session.teacher_id=public.get_my_teacher_id()
    ))
  )
  with check (
    public.get_my_role() in ('admin','director')
    or (public.get_my_role()='teacher' and exists (
      select 1 from public.premium_sessions session
      where session.id=premium_session_id and session.teacher_id=public.get_my_teacher_id()
    ))
  );

drop policy if exists "students teacher read groups" on public.students;
create policy "students teacher read groups" on public.students for select to authenticated
  using (
    public.get_my_role() = 'teacher' and (
      groupe_id in (select id from public.groups where teacher_id=public.get_my_teacher_id())
      or id in (
        select enrollment.student_id from public.enrollments enrollment
        join public.groups regular_group on regular_group.id=enrollment.group_id
        where regular_group.teacher_id=public.get_my_teacher_id() and enrollment.status in ('Validated','Trial')
      )
      or id in (select session.student_id from public.premium_sessions session where session.teacher_id=public.get_my_teacher_id())
      or id in (
        select membership.student_id from public.premium_group_memberships membership
        join public.premium_groups premium_group on premium_group.id=membership.premium_group_id
        where premium_group.teacher_id=public.get_my_teacher_id()
      )
    )
  );

revoke all on function public.can_access_premium_group(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_access_premium_group(uuid) to authenticated;
revoke all on function public.reserve_premium_homework_asset(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_premium_homework_asset(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

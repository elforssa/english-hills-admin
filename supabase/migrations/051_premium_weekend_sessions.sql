-- Phase 3: premium entitlement and one-hour weekend session scheduling.

begin;

alter table public.students
  add column if not exists plan_type text not null default 'Standard',
  add column if not exists premium_start_date date,
  add column if not exists premium_end_date date;

alter table public.students
  drop constraint if exists students_plan_type_check,
  add constraint students_plan_type_check
    check (plan_type in ('Standard', 'Premium')),
  drop constraint if exists students_premium_dates_check,
  add constraint students_premium_dates_check
    check (
      premium_end_date is null
      or premium_start_date is null
      or premium_end_date >= premium_start_date
    );

alter table public.receipts
  add column if not exists plan_type text not null default 'Standard';

alter table public.receipts
  drop constraint if exists receipts_plan_type_check,
  add constraint receipts_plan_type_check
    check (plan_type in ('Standard', 'Premium'));

create table if not exists public.premium_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  student_id uuid not null references public.students(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  group_id uuid references public.groups(id) on delete set null,
  scheduled_date date not null,
  start_time time not null,
  duration_minutes integer not null default 60,
  week_start date generated always as (
    scheduled_date - (extract(isodow from scheduled_date)::integer - 1)
  ) stored,
  status text not null default 'Scheduled',
  focus_note text,
  teacher_note text,
  completed_at timestamptz,
  constraint premium_sessions_weekend_check
    check (extract(isodow from scheduled_date) in (6, 7)),
  constraint premium_sessions_duration_check
    check (duration_minutes = 60),
  constraint premium_sessions_status_check
    check (status in ('Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'Missed')),
  constraint premium_sessions_focus_note_length_check
    check (focus_note is null or char_length(focus_note) <= 2000),
  constraint premium_sessions_teacher_note_length_check
    check (teacher_note is null or char_length(teacher_note) <= 4000)
);

create unique index if not exists premium_sessions_one_active_per_week_idx
  on public.premium_sessions (student_id, week_start)
  where status <> 'Cancelled';

create index if not exists premium_sessions_teacher_schedule_idx
  on public.premium_sessions (teacher_id, scheduled_date, start_time);

create index if not exists premium_sessions_student_schedule_idx
  on public.premium_sessions (student_id, scheduled_date desc);

alter table public.premium_sessions enable row level security;

drop policy if exists "premium sessions admin all" on public.premium_sessions;
create policy "premium sessions admin all" on public.premium_sessions for all
  to authenticated
  using (public.get_my_role() in ('admin', 'director'))
  with check (public.get_my_role() in ('admin', 'director'));

drop policy if exists "premium sessions teacher read" on public.premium_sessions;
create policy "premium sessions teacher read" on public.premium_sessions for select
  to authenticated
  using (
    public.get_my_role() = 'teacher'
    and teacher_id = public.get_my_teacher_id()
  );

drop policy if exists "premium sessions teacher update" on public.premium_sessions;
create policy "premium sessions teacher update" on public.premium_sessions for update
  to authenticated
  using (
    public.get_my_role() = 'teacher'
    and teacher_id = public.get_my_teacher_id()
  )
  with check (
    public.get_my_role() = 'teacher'
    and teacher_id = public.get_my_teacher_id()
  );

drop policy if exists "premium sessions parent read" on public.premium_sessions;
create policy "premium sessions parent read" on public.premium_sessions for select
  to authenticated
  using (
    public.get_my_role() = 'parent'
    and student_id in (select public.get_visible_student_ids())
  );

drop policy if exists "premium sessions student read" on public.premium_sessions;
create policy "premium sessions student read" on public.premium_sessions for select
  to authenticated
  using (
    public.get_my_role() = 'student'
    and student_id in (select public.get_visible_student_ids())
  );

-- Premium teachers must be able to identify a student assigned directly to
-- them even when that student belongs to a different regular group.
drop policy if exists "students teacher read groups" on public.students;
create policy "students teacher read groups" on public.students for select
  to authenticated
  using (
    public.get_my_role() = 'teacher'
    and (
      groupe_id in (
        select g.id from public.groups g
        where g.teacher_id = public.get_my_teacher_id()
      )
      or id in (
        select e.student_id
        from public.enrollments e
        join public.groups g on g.id = e.group_id
        where g.teacher_id = public.get_my_teacher_id()
          and e.status in ('Validated', 'Trial')
      )
      or id in (
        select premium.student_id
        from public.premium_sessions premium
        where premium.teacher_id = public.get_my_teacher_id()
      )
    )
  );

create or replace function public.guard_premium_session_teacher_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if public.get_my_role() = 'teacher' and (
    new.student_id is distinct from old.student_id
    or new.teacher_id is distinct from old.teacher_id
    or new.group_id is distinct from old.group_id
    or new.scheduled_date is distinct from old.scheduled_date
    or new.start_time is distinct from old.start_time
    or new.duration_minutes is distinct from old.duration_minutes
    or new.focus_note is distinct from old.focus_note
  ) then
    raise exception 'Teachers may update only the outcome and teaching notes of their Premium sessions.';
  end if;
  return new;
end;
$$;

drop trigger if exists premium_sessions_guard_teacher_update on public.premium_sessions;
create trigger premium_sessions_guard_teacher_update
before update on public.premium_sessions
for each row execute function public.guard_premium_session_teacher_update();

drop trigger if exists premium_sessions_set_updated_at on public.premium_sessions;
create trigger premium_sessions_set_updated_at
before update on public.premium_sessions
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
commit;

-- Final workflow review: enforce Premium entitlement at the database boundary
-- and keep learner homework submissions genuinely pre-class.

begin;

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
begin
  -- Status and teacher-note updates on an existing historical session remain
  -- possible after a plan ends. Validate only new or structurally rescheduled
  -- sessions.
  if tg_op = 'UPDATE'
    and new.student_id is not distinct from old.student_id
    and new.scheduled_date is not distinct from old.scheduled_date then
    return new;
  end if;

  select student.plan_type, student.premium_start_date,
         student.premium_end_date, student.deleted_at
    into student_plan, entitlement_start, entitlement_end, student_deleted_at
  from public.students student
  where student.id = new.student_id;

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

drop trigger if exists premium_sessions_validate_entitlement on public.premium_sessions;
create trigger premium_sessions_validate_entitlement
before insert or update of student_id, scheduled_date on public.premium_sessions
for each row execute function public.validate_premium_session_entitlement();

create or replace function public.guard_premium_homework_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  linked_student uuid;
  linked_teacher uuid;
  linked_date date;
  linked_status text;
  caller_role text := public.get_my_role();
begin
  select session.student_id, session.teacher_id, session.scheduled_date, session.status
    into linked_student, linked_teacher, linked_date, linked_status
  from public.premium_sessions session
  where session.id = new.premium_session_id;

  if not found or linked_status = 'Cancelled' then
    raise exception 'A valid Premium session is required.';
  end if;

  new.title := btrim(new.title);

  if tg_op = 'INSERT' then
    if caller_role in ('student', 'parent') and linked_date < current_date then
      raise exception 'Homework must be submitted before the Premium session.';
    end if;
    new.student_id := linked_student;
    new.teacher_id := linked_teacher;
    new.status := 'Submitted';
    new.teacher_note := null;
    new.reviewed_at := null;
    new.submitted_at := now();
  elsif caller_role in ('student', 'parent') then
    if linked_date < current_date then
      raise exception 'Homework must be submitted before the Premium session.';
    end if;
    if (new.premium_session_id, new.student_id, new.teacher_id)
       is distinct from
       (old.premium_session_id, old.student_id, old.teacher_id) then
      raise exception 'Learners may update only their submission content.';
    end if;
    new.status := 'Submitted';
    new.teacher_note := null;
    new.reviewed_at := null;
    new.submitted_at := now();
  elsif caller_role = 'teacher' then
    if (new.premium_session_id, new.student_id, new.teacher_id, new.title, new.student_note, new.file_url, new.file_name)
       is distinct from
       (old.premium_session_id, old.student_id, old.teacher_id, old.title, old.student_note, old.file_url, old.file_name) then
      raise exception 'Teachers may update only preparation fields.';
    end if;
    if new.status not in ('Reviewed', 'Prepared') then
      raise exception 'Teachers may mark homework only as Reviewed or Prepared.';
    end if;
    if new.reviewed_at is null then
      new.reviewed_at := now();
    end if;
  end if;

  if linked_student is distinct from new.student_id or linked_teacher is distinct from new.teacher_id then
    raise exception 'Submission assignment does not match the Premium session.';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;

begin;

-- Migration 024 resolves teacher identity by the protected profile email.
-- Keep attendance enforcement aligned with the existing RLS identity model.
create or replace function public.enforce_attendance_integrity()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_role text;
  v_teacher uuid;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role not in ('director','admin','teacher') then
    raise exception 'Attendance actor unauthorized' using errcode = '42501';
  end if;
  if v_role = 'teacher' then
    v_teacher := public.get_my_teacher_id();
    if v_teacher is null or not exists (
      select 1 from public.groups g where g.id = new.group_id and g.teacher_id = v_teacher
    ) then raise exception 'Teacher not assigned to group' using errcode = '42501'; end if;
  end if;
  if tg_op = 'UPDATE' and
    (new.student_id, new.group_id, new.session_date)
      is distinct from (old.student_id, old.group_id, old.session_date) then
    raise exception 'Attendance identity is immutable' using errcode = '23514';
  end if;
  if not public.attendance_student_in_group(new.student_id, new.group_id) then
    raise exception 'Student is not enrolled in group' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'attendance:' || new.student_id::text || ':' || new.group_id::text || ':' || new.session_date::text, 0));
    if exists (select 1 from public.attendance a
      where a.student_id = new.student_id and a.group_id = new.group_id
        and a.session_date = new.session_date) then
      raise exception 'Attendance already exists' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

commit;

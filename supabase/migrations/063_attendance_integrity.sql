begin;

create or replace function public.attendance_student_in_group(p_student uuid, p_group uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.students s where s.id = p_student
      and (s.groupe_id = p_group or exists (
        select 1 from public.enrollments e
        where e.student_id = s.id and e.group_id = p_group
          and e.status in ('Validated','Trial')
      ))
  );
$$;
revoke all on function public.attendance_student_in_group(uuid,uuid) from public, anon, authenticated;

create or replace function public.enforce_attendance_integrity()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_role text;
  v_teacher uuid;
begin
  select p.role, p.linked_teacher_id into v_role, v_teacher
  from public.profiles p where p.id = auth.uid();
  if v_role not in ('director','admin','teacher') then
    raise exception 'Attendance actor unauthorized' using errcode = '42501';
  end if;
  if v_role = 'teacher' and not exists (
    select 1 from public.groups g where g.id = new.group_id and g.teacher_id = v_teacher
  ) then raise exception 'Teacher not assigned to group' using errcode = '42501'; end if;
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
drop trigger if exists enforce_attendance_integrity on public.attendance;
create trigger enforce_attendance_integrity before insert or update on public.attendance
for each row execute function public.enforce_attendance_integrity();
revoke all on function public.enforce_attendance_integrity() from public, anon, authenticated;

create or replace function public.save_attendance(
  p_student uuid, p_group uuid, p_date date, p_status text
) returns uuid language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if p_student is null or p_group is null or p_date is null
    or p_status not in ('Présent','Absent','Retard','Justifié') then
    raise exception 'Invalid attendance input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'attendance:' || p_student::text || ':' || p_group::text || ':' || p_date::text, 0));
  select count(*), min(a.id::text)::uuid into v_count, v_id
  from public.attendance a where a.student_id = p_student and a.group_id = p_group and a.session_date = p_date;
  if v_count > 1 then
    raise exception 'Conflicting historical attendance rows require review' using errcode = '23505';
  end if;
  if v_id is null then
    insert into public.attendance(student_id,group_id,session_date,status)
    values(p_student,p_group,p_date,p_status) returning id into v_id;
  else
    update public.attendance set status = p_status where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_attendance(uuid,uuid,date,text) from public, anon, authenticated;
grant execute on function public.save_attendance(uuid,uuid,date,text) to authenticated;
commit;

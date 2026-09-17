begin;

-- Enrollment and its denormalized student status now change in the same
-- database statement. Existing rows are untouched until they are edited.
create or replace function public.sync_student_from_enrollments(
  p_student uuid, p_force_downgrade boolean, p_previous_group uuid
) returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_current public.students%rowtype;
  v_status text;
  v_group uuid;
  v_student_status text;
begin
  if p_student is null then return; end if;
  select * into v_current from public.students where id = p_student for update;
  if not found then return; end if;

  select e.status, e.group_id into v_status, v_group
  from public.enrollments e where e.student_id = p_student
  order by case e.status
    when 'Validated' then 0 when 'Trial' then 1
    when 'Under Review' then 2 when 'Submitted' then 3 else 4 end,
    e.updated_at desc, e.created_at desc, e.id desc
  limit 1;

  v_student_status := case v_status
    when 'Validated' then 'Enrolled'
    when 'Trial' then 'Trial'
    when 'Rejected' then 'Inactive'
    else 'Prospect' end;
  if not p_force_downgrade and v_status not in ('Validated','Trial')
    and v_current.status in ('Enrolled','Trial','Alumni') then
    v_student_status := v_current.status;
  end if;

  update public.students s set
    status = v_student_status,
    groupe_id = case
      when v_status in ('Validated','Trial') then v_group
      when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
      else s.groupe_id end
  where s.id = p_student
    and (s.status is distinct from v_student_status
      or s.groupe_id is distinct from case
        when v_status in ('Validated','Trial') then v_group
        when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
        else s.groupe_id end);
end;
$$;
revoke all on function public.sync_student_from_enrollments(uuid,boolean,uuid) from public, anon, authenticated;

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
      old.status in ('Validated','Trial'), old.group_id);
    return old;
  end if;
  perform public.sync_student_from_enrollments(new.student_id,
    tg_op = 'UPDATE' and old.status in ('Validated','Trial')
      and new.status not in ('Validated','Trial'),
    case when tg_op = 'UPDATE' then old.group_id else null end);
  return new;
end;
$$;
revoke all on function public.enforce_enrollment_student_sync() from public, anon, authenticated;

create or replace function public.check_enrollment_student_sync()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.student_id is null then
    raise exception 'Enrollment requires a student' using errcode = '23514';
  end if;
  if new.status in ('Validated','Trial') and new.group_id is null then
    raise exception 'Active enrollment requires a group' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
    raise exception 'Enrollment student is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_enrollment_student_sync() from public, anon, authenticated;

create trigger enrollment_student_sync_before before insert or update on public.enrollments
for each row execute function public.check_enrollment_student_sync();
create trigger enrollment_student_sync_after after insert or update or delete on public.enrollments
for each row execute function public.enforce_enrollment_student_sync();

commit;

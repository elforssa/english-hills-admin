begin;

create or replace function public.enforce_dismissal_integrity()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_role text;
  v_staff text;
  v_student text;
  v_adult text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Dismissal history is immutable; contact the director for a documented correction.'
      using errcode = '42501';
  end if;
  select p.role, p.full_name into v_role, v_staff
  from public.profiles p where p.id = auth.uid();
  if v_role not in ('admin','director') or v_staff is null or pg_catalog.btrim(v_staff) = '' then
    raise exception 'Authorized staff profile required' using errcode = '42501';
  end if;
  select s.full_name into v_student from public.students s where s.id = new.student_id;
  select a.full_name into v_adult from public.authorized_adults a
  where a.id = new.adult_id and a.student_id = new.student_id;
  if v_student is null or v_adult is null then
    raise exception 'Adult is not authorized for this student' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dismissal:' || new.student_id::text, 0)
  );
  if exists (
    select 1 from public.dismissal_logs d
    where d.student_id = new.student_id and d.confirmed is true
      and (d.timestamp at time zone 'Africa/Casablanca')::date
        = (pg_catalog.clock_timestamp() at time zone 'Africa/Casablanca')::date
  ) then
    raise exception 'Student already dismissed today' using errcode = '23505';
  end if;
  new.student_name := v_student;
  new.adult_name := v_adult;
  new.staff_name := v_staff;
  new.timestamp := pg_catalog.clock_timestamp();
  new.confirmed := true;
  return new;
end;
$$;

drop trigger if exists enforce_dismissal_integrity on public.dismissal_logs;
create trigger enforce_dismissal_integrity
before insert or update or delete on public.dismissal_logs
for each row execute function public.enforce_dismissal_integrity();
revoke all on function public.enforce_dismissal_integrity() from public, anon, authenticated;
commit;

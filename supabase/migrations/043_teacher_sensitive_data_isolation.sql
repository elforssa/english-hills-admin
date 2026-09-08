-- Batch 3A: teacher HR isolation only. No enrollment/leave-approval changes.
-- Apply with the updated directory consumers; older non-admin teacher reads
-- fail closed until the application deploy completes.
begin;

drop policy if exists "teachers read all auth" on public.teachers;
drop policy if exists "teachers self update" on public.teachers;
-- Defense in depth against another permissive policy broadening table access.
-- Keep the existing admin SELECT/INSERT/UPDATE and soft-delete filter policies.
create policy "teachers HR staff only" on public.teachers as restrictive
  for all to authenticated
  using (auth.uid() is not null and public.get_my_role() in ('admin','director'))
  with check (auth.uid() is not null and public.get_my_role() in ('admin','director'));

-- Payroll duplicates teacher compensation. No non-staff application screen
-- consumes payslips; preserve the staff payroll policies and backend endpoint.
drop policy if exists "payroll teacher read" on public.payroll;
create policy "payroll HR staff only" on public.payroll as restrictive
  for all to authenticated
  using (auth.uid() is not null and public.get_my_role() in ('admin','director'))
  with check (auth.uid() is not null and public.get_my_role() in ('admin','director'));

-- Explicit scalar result columns, NOT SETOF teachers: PostgREST callers cannot
-- select/filter HR columns or automatically embed relationships back into HR.
-- Preserve the existing school-wide teacher messaging contacts, not HR access.
create function public.get_teacher_directory(p_teacher_id uuid default null)
returns table (id uuid, full_name text, email text)
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$ begin
  if auth.uid() is null or (public.get_my_role() in ('parent','student','teacher','admin','director')) is not true then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query select t.id, t.full_name, t.email
    from public.teachers t
    where t.deleted_at is null and (p_teacher_id is null or t.id = p_teacher_id);
end $$;
revoke all on function public.get_teacher_directory(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_teacher_directory(uuid) to authenticated;

-- get_my_teacher_id() (024) is deliberately retained: its fixed-path,
-- SECURITY DEFINER email lookup must continue working behind the HR table RLS.
-- No new teacher self-edit operation: none is used by the current portal.
notify pgrst, 'reload schema';
commit;

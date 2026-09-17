begin;

-- Use one definer relationship check for teacher student visibility. Reading
-- enrollments directly inside the students RLS policy caused a recursive
-- policy evaluation when staff wrote an enrollment.
create or replace function public.teacher_can_access_student_group(
  p_student uuid, p_group uuid default null
) returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select public.get_my_role() = 'teacher'
    and public.get_my_teacher_id() is not null
    and exists (
      select 1 from public.groups g
      where g.teacher_id = public.get_my_teacher_id()
        and (p_group is null or g.id = p_group)
        and (
          exists (select 1 from public.students s where s.id = p_student
            and s.groupe_id = g.id and s.status in ('Enrolled','Trial'))
          or exists (select 1 from public.enrollments e
            where e.student_id = p_student and e.group_id = g.id
              and e.status in ('Validated','Trial'))
        )
    );
$$;
revoke all on function public.teacher_can_access_student_group(uuid,uuid) from public, anon, authenticated;
grant execute on function public.teacher_can_access_student_group(uuid,uuid) to authenticated;

create or replace function public.teacher_can_see_student(p_student uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select public.teacher_can_access_student_group(p_student,null)
    or (public.get_my_role() = 'teacher' and exists (
      select 1 from public.premium_sessions ps
      where ps.student_id = p_student and ps.teacher_id = public.get_my_teacher_id()
    ))
    or (public.get_my_role() = 'teacher' and exists (
      select 1 from public.premium_group_memberships pm
      join public.premium_groups pg on pg.id = pm.premium_group_id
      where pm.student_id = p_student and pg.teacher_id = public.get_my_teacher_id()
    ));
$$;
revoke all on function public.teacher_can_see_student(uuid) from public, anon, authenticated;
grant execute on function public.teacher_can_see_student(uuid) to authenticated;

drop policy if exists "students teacher read groups" on public.students;
create policy "students teacher read groups" on public.students for select to authenticated
  using (public.teacher_can_see_student(id));

drop policy if exists "assessments teacher rw" on public.assessments;
create policy "assessments teacher rw" on public.assessments for all to authenticated
  using (public.teacher_can_access_student_group(student_id,group_id))
  with check (public.teacher_can_access_student_group(student_id,group_id));

drop policy if exists "learnassess teacher rw" on public.learning_assessments;
create policy "learnassess teacher rw" on public.learning_assessments for all to authenticated
  using (public.teacher_can_access_student_group(student_id,null))
  with check (public.teacher_can_access_student_group(student_id,null));

drop policy if exists "placement teacher rw" on public.placement_tests;
create policy "placement teacher rw" on public.placement_tests for all to authenticated
  using (public.teacher_can_access_student_group(student_id,null))
  with check (public.teacher_can_access_student_group(student_id,null));

drop policy if exists "portfolios teacher rw" on public.portfolios;
create policy "portfolios teacher rw" on public.portfolios for all to authenticated
  using (public.teacher_can_access_student_group(student_id,null))
  with check (public.teacher_can_access_student_group(student_id,null));

drop policy if exists "certificates teacher read" on public.certificates;
create policy "certificates teacher read" on public.certificates for select to authenticated
  using (public.teacher_can_access_student_group(student_id,null));

commit;

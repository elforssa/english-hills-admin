begin;

create or replace function public.can_message_recipient(p_email text)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  with actor as (
    select p.role, p.email, p.linked_student_id, p.linked_teacher_id
    from public.profiles p where p.id = auth.uid()
  ), target as (
    select pg_catalog.lower(pg_catalog.btrim(p_email)) as email
  ), students_for_actor as (
    select s.id, s.groupe_id from public.students s, actor a
    where a.role in ('parent','student')
      and (s.id = a.linked_student_id
        or pg_catalog.lower(s.email) = pg_catalog.lower(a.email)
        or (a.role = 'parent' and pg_catalog.lower(s.parent_email) = pg_catalog.lower(a.email)))
  ), actor_groups as (
    select id as group_id from public.groups g, actor a
    where a.role = 'teacher' and g.teacher_id = a.linked_teacher_id
  ), student_groups as (
    select id as group_id from public.groups g
    where g.id in (select groupe_id from students_for_actor)
    union
    select e.group_id from public.enrollments e
    where e.student_id in (select id from students_for_actor)
      and e.status in ('Validated','Trial')
  )
  select exists (
    select 1 from actor a, target t
    where a.role in ('director','admin','teacher','parent','student')
      and t.email <> '' and t.email is not null
      and (
        -- Staff may contact only known school people.
        (a.role in ('director','admin') and (
          exists(select 1 from public.profiles p where p.role <> 'pending' and pg_catalog.lower(p.email) = t.email)
          or exists(select 1 from public.students s where pg_catalog.lower(s.email) = t.email or pg_catalog.lower(s.parent_email) = t.email)
          or exists(select 1 from public.teachers x where pg_catalog.lower(x.email) = t.email)
        ))
        -- Any active user can contact the office.
        or exists(select 1 from public.profiles p where p.role in ('director','admin') and pg_catalog.lower(p.email) = t.email)
        -- Parents/students can contact teachers of their own groups.
        or (a.role in ('parent','student') and exists (
          select 1 from public.groups g join public.teachers x on x.id = g.teacher_id
          where g.id in (select group_id from student_groups) and pg_catalog.lower(x.email) = t.email
        ))
        -- Teachers can contact only students/parents in assigned groups.
        or (a.role = 'teacher' and exists (
          select 1 from public.students s where
            (s.groupe_id in (select group_id from actor_groups)
             or exists(select 1 from public.enrollments e
               where e.student_id = s.id and e.group_id in (select group_id from actor_groups)
                 and e.status in ('Validated','Trial')))
            and (pg_catalog.lower(s.email) = t.email or pg_catalog.lower(s.parent_email) = t.email)
        ))
      )
  );
$$;

revoke all on function public.can_message_recipient(text) from public, anon, authenticated;
grant execute on function public.can_message_recipient(text) to authenticated;

drop policy if exists "messages self insert" on public.messages;
create policy "messages self insert" on public.messages for insert
  with check (
    from_user_email = get_my_email()
    and public.can_message_recipient(to_user_email)
  );

commit;

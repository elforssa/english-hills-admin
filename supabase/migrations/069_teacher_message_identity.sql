begin;

-- A teacher profile normally has no linked_teacher_id. Use the same
-- email-based identity as teacher RLS and attendance instead of the optional
-- profile link when resolving groups for messaging.
create or replace function public.can_message_recipient(p_email text)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  with actor as (
    select p.role, p.email, p.linked_student_id
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
    select g.id as group_id from public.groups g, actor a
    where a.role = 'teacher' and g.teacher_id = public.get_my_teacher_id()
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
        (a.role in ('director','admin') and (
          exists(select 1 from public.profiles p where p.role <> 'pending' and pg_catalog.lower(p.email) = t.email)
          or exists(select 1 from public.students s where pg_catalog.lower(s.email) = t.email or pg_catalog.lower(s.parent_email) = t.email)
          or exists(select 1 from public.teachers x where pg_catalog.lower(x.email) = t.email)
        ))
        or exists(select 1 from public.profiles p where p.role in ('director','admin') and pg_catalog.lower(p.email) = t.email)
        or (a.role in ('parent','student') and exists (
          select 1 from public.groups g join public.teachers x on x.id = g.teacher_id
          where g.id in (select group_id from student_groups) and pg_catalog.lower(x.email) = t.email
        ))
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

commit;

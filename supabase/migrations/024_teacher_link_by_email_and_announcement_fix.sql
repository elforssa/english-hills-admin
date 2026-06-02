-- =============================================================================
-- 024 — Make teacher identity email-based + fix group-announcement subquery
--
-- ── Part 1 · get_my_teacher_id() resolves by email (was: profiles.linked_teacher_id)
--
--   BUG: every teacher-scoped RLS policy keys off get_my_teacher_id(), which
--   returned profiles.linked_teacher_id. That column is NEVER populated by the
--   application — no UI, API route, invite step, or trigger ever sets it. So a
--   teacher onboarded through the normal invite flow has linked_teacher_id IS
--   NULL, get_my_teacher_id() returns NULL, and every teacher policy
--   (students/attendance/assessments/portfolios/certificates/learning_assessments/
--   enrollments) matches nothing. The teacher portal shows group cards but no
--   students, and saving attendance/notes is rejected by the insert WITH CHECK.
--
--   The UI already identifies a teacher by matching teachers.email to the
--   signed-in profile's email (and parents/students are likewise resolved by
--   email via get_visible_student_ids()). This aligns the RLS helper with that
--   model: resolve the teacher row by email. teachers.email is UNIQUE
--   (migration 020), so the scalar subquery returns at most one row.
--
--   linked_teacher_id is left in place (still read by get_my_teacher_id's old
--   callers? no — this is the only definition) for possible future explicit
--   linking, but is no longer required for teachers to function.
--
-- ── Part 2 · announcements group-audience policy: use IN, not =
--
--   The "announcements audience read" policy compared group_id to a scalar
--   subquery `= (select groupe_id from students where id in (visible ids))`.
--   A parent with more than one child makes that subquery return multiple
--   rows → "more than one row returned by a subquery used as an expression"
--   at scan time, breaking the announcements query entirely once group-audience
--   rows are in scope. Switch to `in (...)` so multi-child parents are safe.
-- =============================================================================


-- ── Part 1 ──────────────────────────────────────────────────────────────────
create or replace function public.get_my_teacher_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.teachers
   where email = public.get_my_email()
   limit 1
$$;


-- ── Part 2 ──────────────────────────────────────────────────────────────────
drop policy if exists "announcements audience read" on public.announcements;

create policy "announcements audience read" on public.announcements for select
  using (
    auth.uid() is not null
    and (
      audience = 'all'
      or (audience = 'parents'  and get_my_role() = 'parent')
      or (audience = 'teachers' and get_my_role() = 'teacher')
      or (
        audience = 'group'
        and group_id in (
          select g.id from public.groups g
          where (get_my_role() = 'teacher' and g.teacher_id = get_my_teacher_id())
             or (get_my_role() in ('parent','student')
                 and g.id in (
                   select groupe_id from public.students
                    where id in (select public.get_visible_student_ids())
                 ))
        )
      )
    )
  );

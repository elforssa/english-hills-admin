-- Portal readiness (plan PRF-r2) prepared corrective migration: REVIEWED, NOT
-- APPLIED. Recovery is forward (plan "Migration strategy"): if the portals must be
-- reopened on the pre-123 access model before the first invitation, the release
-- task copies this file into a new numbered migration with the owner's approval,
-- together with an application revert. It re-creates, from their migration-121
-- definitions, every policy migration 123 removed or replaced, and restores the
-- anonymous grant on the legacy reconciliation view. It keeps the family-link
-- visibility, the bound teacher identity, the new functions, columns, triggers
-- and the D12 helper grants: they are inert or narrower without these policies.
-- Exercised by scripts/test-portal-readiness-upgrade.mjs (mode corrective).
begin;

-- D2: whole-row family and teacher reads.
create policy "students parent read self" on public.students for select
  using (get_my_role() = 'parent' and id in (select get_visible_student_ids()));
create policy "students student read self" on public.students for select
  using (get_my_role() = 'student' and id in (select get_visible_student_ids()));
create policy "students teacher read groups" on public.students for select to authenticated
  using (teacher_can_see_student(id));
create policy "enrollments parent select" on public.enrollments for select
  using (get_my_role() = 'parent' and student_id in (select get_visible_student_ids()));
create policy "enrollments parent insert" on public.enrollments for insert to authenticated
  with check (auth.uid() is not null and get_my_role() = 'parent' and student_id in (select get_visible_student_ids())
    and exists (select 1 from public.students s where s.id = enrollments.student_id and s.deleted_at is null)
    and status = 'Submitted' and group_id is null and documents_urls is null and created_at = now() and updated_at = now());
create policy "enrollments teacher read" on public.enrollments for select
  using (get_my_role() = 'teacher' and group_id in (select groups.id from public.groups where groups.teacher_id = get_my_teacher_id()));
create policy "receipts parent read" on public.receipts for select
  using (get_my_role() = 'parent' and student_id in (select get_visible_student_ids()));
create policy "receipts student financial read" on public.receipts for select to authenticated
  using (get_my_role() = 'student' and student_id in (select get_visible_student_ids()));
create policy "charges family read" on public.charges for select to authenticated
  using (student_id in (select get_visible_student_ids()));
create policy "placement parent read" on public.placement_tests for select
  using (get_my_role() = 'parent' and student_id in (select get_visible_student_ids()));
create policy "placement student read" on public.placement_tests for select
  using (get_my_role() = 'student' and student_id in (select get_visible_student_ids()));
create policy "attendance parent read" on public.attendance for select
  using (get_my_role() = 'parent' and student_id in (select get_visible_student_ids()));
create policy "attendance student read" on public.attendance for select
  using (get_my_role() = 'student' and student_id in (select get_visible_student_ids()));
create policy "certificates parent read" on public.certificates for select
  using (get_my_role() = 'parent' and student_id in (select get_visible_student_ids()));
create policy "certificates student read" on public.certificates for select
  using (get_my_role() = 'student' and student_id in (select get_visible_student_ids()));
grant select on public.legacy_receipt_reconciliation to anon;

-- D4/D5: teacher attendance by group, teacher ALL policies and attendance delete.
drop policy "attendance teacher insert" on public.attendance;
drop policy "attendance teacher update" on public.attendance;
create policy "attendance teacher insert" on public.attendance for insert
  with check (get_my_role() = 'teacher' and group_id in (select groups.id from public.groups where groups.teacher_id = get_my_teacher_id()));
create policy "attendance teacher update" on public.attendance for update
  using (get_my_role() = 'teacher' and group_id in (select groups.id from public.groups where groups.teacher_id = get_my_teacher_id()))
  with check (get_my_role() = 'teacher' and group_id in (select groups.id from public.groups where groups.teacher_id = get_my_teacher_id()));
create policy "attendance teacher delete" on public.attendance for delete
  using (get_my_role() = 'teacher' and group_id in (select groups.id from public.groups where groups.teacher_id = get_my_teacher_id()));
drop policy "assessments teacher select" on public.assessments;
drop policy "assessments teacher insert" on public.assessments;
drop policy "assessments teacher update" on public.assessments;
create policy "assessments teacher rw" on public.assessments for all to authenticated
  using (teacher_can_access_student_group(student_id, group_id)) with check (teacher_can_access_student_group(student_id, group_id));
drop policy "learnassess teacher select" on public.learning_assessments;
drop policy "learnassess teacher insert" on public.learning_assessments;
drop policy "learnassess teacher update" on public.learning_assessments;
create policy "learnassess teacher rw" on public.learning_assessments for all to authenticated
  using (teacher_can_access_student_group(student_id, null)) with check (teacher_can_access_student_group(student_id, null));
drop policy "placement teacher select" on public.placement_tests;
drop policy "placement teacher insert" on public.placement_tests;
drop policy "placement teacher update" on public.placement_tests;
create policy "placement teacher rw" on public.placement_tests for all to authenticated
  using (teacher_can_access_student_group(student_id, null)) with check (teacher_can_access_student_group(student_id, null));
drop policy "portfolios teacher select" on public.portfolios;
drop policy "portfolios teacher insert" on public.portfolios;
drop policy "portfolios teacher update" on public.portfolios;
create policy "portfolios teacher rw" on public.portfolios for all to authenticated
  using (teacher_can_access_student_group(student_id, null)) with check (teacher_can_access_student_group(student_id, null));

-- D6: student portfolio policies without the author condition.
drop policy "portfolios student update" on public.portfolios;
drop policy "portfolios student delete" on public.portfolios;
create policy "portfolios student update" on public.portfolios for update
  using (get_my_role() = 'student' and student_id in (select get_visible_student_ids()))
  with check (get_my_role() = 'student' and student_id in (select get_visible_student_ids()));
create policy "portfolios student delete" on public.portfolios for delete
  using (get_my_role() = 'student' and student_id in (select get_visible_student_ids()));

-- D7/D7b: e-mail-keyed message and notification policies.
drop policy "notifications self read" on public.notifications;
create policy "notifications self read" on public.notifications for select using (recipient_email = get_my_email());
drop policy "messages self read" on public.messages;
create policy "messages self read" on public.messages for select
  using (to_user_email = get_my_email() or from_user_email = get_my_email());
drop policy "messages self insert" on public.messages;
create policy "messages self insert" on public.messages for insert
  with check (from_user_email = get_my_email() and can_message_recipient(to_user_email));

-- D11: signed-in-only reads.
drop policy "groups read all auth" on public.groups;
create policy "groups read all auth" on public.groups for select using (auth.uid() is not null);
drop policy "appconfig auth read" on public.app_config;
create policy "appconfig auth read" on public.app_config for select using (auth.uid() is not null);
drop policy "announcements audience read" on public.announcements;
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
             or (get_my_role() in ('parent', 'student') and g.id in (select public.my_member_group_ids()))
        )
      )
    )
  );

notify pgrst, 'reload schema';
commit;

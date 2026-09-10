-- Batch 3B: requests are append-only for parents/teachers; decisions are staff-owned.
-- Existing staff policies and teacher enrollment visibility are unchanged.
begin;

drop policy if exists "enrollments parent update" on public.enrollments;
drop policy if exists "enrollments parent delete" on public.enrollments;
drop policy if exists "enrollments parent insert" on public.enrollments;
create policy "enrollments parent insert" on public.enrollments
  for insert to authenticated
  with check (
    auth.uid() is not null
    and public.get_my_role() = 'parent'
    and student_id in (select public.get_visible_student_ids())
    -- The legacy identity helper includes archived children; new requests
    -- must also refer to a currently visible, non-deleted student row.
    and exists (select 1 from public.students s
      where s.id = student_id and s.deleted_at is null)
    and status = 'Submitted'
    and group_id is null
    and documents_urls is null
    and created_at = now()
    and updated_at = now()
  );

drop policy if exists "leave teacher rw" on public.leave_requests;
create policy "leave teacher select" on public.leave_requests
  for select to authenticated
  using (
    auth.uid() is not null
    and public.get_my_role() = 'teacher'
    and teacher_id = public.get_my_teacher_id()
  );
create policy "leave teacher insert" on public.leave_requests
  for insert to authenticated
  with check (
    auth.uid() is not null
    and public.get_my_role() = 'teacher'
    and teacher_id = public.get_my_teacher_id()
    -- The directory is the existing three-column definer interface from 043;
    -- direct teachers reads are intentionally denied to teachers.
    and teacher_name = (
      select d.full_name from public.get_teacher_directory(teacher_id) d
      where d.id = teacher_id
    )
    and status = 'En attente'
    and remplacant is null
    and date_fin >= date_debut
    and created_at = now()
    and updated_at = now()
  );

-- No new function or grant. RLS checks must be TRUE, so NULL identities,
-- roles, statuses, or teacher matches cannot authorize a submission.
-- service_role retains its pre-existing backend table access (public signup).
notify pgrst, 'reload schema';
commit;

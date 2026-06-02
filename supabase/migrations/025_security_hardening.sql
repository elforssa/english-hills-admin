-- =============================================================================
-- 025 — Security hardening (audit follow-up)
--
-- 1. Remove the anon INSERT policies on students/enrollments. The public
--    enrollment form goes through /api/public/inscription, which runs as
--    service_role and bypasses RLS — so those rows still flow. The anon
--    policies let anyone POST straight to PostgREST with the public anon key,
--    skipping the route's origin check, Turnstile, and IP rate limit. The
--    route is the only intended entry point; close the side door.
--
-- 2. Enforce soft-delete on retention-sensitive tables. The "<table> admin all"
--    policies were FOR ALL, which includes DELETE — so an admin could hard-
--    delete receipts/payments/teachers/students despite the soft-delete RPCs
--    (017/019) and the 10-year retention intent. Replace each FOR ALL policy
--    with explicit SELECT/INSERT/UPDATE (no DELETE). After this, the ONLY way
--    to remove a row is the SECURITY DEFINER soft_delete_* RPC, which sets
--    deleted_at and is role-gated (director-only for receipts/payments).
--
-- 3. Document the email-attribute visibility invariant (#5) as a COMMENT so it
--    travels with the schema.
-- =============================================================================


-- ── 1 · Drop anon-insert side doors ─────────────────────────────────────────
drop policy if exists "students anon insert prospect" on public.students;
drop policy if exists "enrollments anon insert"        on public.enrollments;


-- ── 2 · Replace FOR ALL admin policies with SELECT/INSERT/UPDATE (no DELETE) ─

-- students
drop policy if exists "students admin all" on public.students;
create policy "students admin select" on public.students for select
  using (get_my_role() in ('admin','director'));
create policy "students admin insert" on public.students for insert
  with check (get_my_role() in ('admin','director'));
create policy "students admin update" on public.students for update
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

-- teachers
drop policy if exists "teachers admin all" on public.teachers;
create policy "teachers admin select" on public.teachers for select
  using (get_my_role() in ('admin','director'));
create policy "teachers admin insert" on public.teachers for insert
  with check (get_my_role() in ('admin','director'));
create policy "teachers admin update" on public.teachers for update
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

-- receipts
drop policy if exists "receipts admin all" on public.receipts;
create policy "receipts admin select" on public.receipts for select
  using (get_my_role() in ('admin','director'));
create policy "receipts admin insert" on public.receipts for insert
  with check (get_my_role() in ('admin','director'));
create policy "receipts admin update" on public.receipts for update
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

-- payments
drop policy if exists "payments admin all" on public.payments;
create policy "payments admin select" on public.payments for select
  using (get_my_role() in ('admin','director'));
create policy "payments admin insert" on public.payments for insert
  with check (get_my_role() in ('admin','director'));
create policy "payments admin update" on public.payments for update
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));


-- ── 3 · Document the email-based visibility invariant (#5) ──────────────────
comment on function public.get_visible_student_ids() is
  'INVARIANT: parent/student visibility is keyed on email — a parent sees every '
  'students row whose parent_email equals their profile email; a student sees '
  'rows whose email equals theirs. Consequences: (a) a shared family email or a '
  'mistyped parent_email crosses data between families; (b) these fields are '
  'editable only by admin/director, so the blast radius is staff data-entry. '
  'Keep students.email / students.parent_email accurate and unique per family.';

comment on function public.get_my_teacher_id() is
  'INVARIANT: teacher identity is keyed on email (teachers.email = profile email, '
  'UNIQUE per migration 020). A teacher with no matching teachers row sees no '
  'student data. Mirrors the parent/student email model in get_visible_student_ids().';

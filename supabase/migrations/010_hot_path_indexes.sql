-- ============================================================================
-- 010 · composite indexes on hot query paths
--
-- The initial schema (migration 001) declared primary keys and foreign-key
-- columns but no secondary indexes. As soon as a center has a few thousand
-- attendance rows or a year of receipts, the lookup patterns below start
-- to sequentially scan the table. These indexes cover the queries the app
-- actually makes today (grep src/ for `.from('table').filter/.eq`).
--
-- Notes on choices:
--   • Most lookups filter by a parent FK first and then by date/term.
--     Composite (fk, date) indexes serve both pure-FK lookups and the
--     date-narrowed variants from a single B-tree.
--   • Where the parent FK is nullable (ON DELETE SET NULL) we still index
--     it — NULLs are valid index entries in Postgres and we want fast
--     access for the non-null rows that dominate.
--   • `idx_*_term_year` indexes accelerate the "current term" reports
--     that the dashboard/finance pages run.
--   • CREATE INDEX IF NOT EXISTS so re-running the migration is safe.
--
-- Run AFTER the app has any data: `CREATE INDEX` takes a write lock, but
-- on a fresh DB this is a no-op. Use `CREATE INDEX CONCURRENTLY` if you
-- ever need to add an index on a hot table in production — pgsql migrate
-- runs inside a transaction by default and CONCURRENTLY can't, so you'd
-- need to split it out.
-- ============================================================================

-- ── students ────────────────────────────────────────────────────────────────
-- Parent portal: "find all students whose parent_email matches mine".
create index if not exists idx_students_parent_email
  on public.students (parent_email)
  where parent_email is not null;

-- Sidebar/student-portal lookups by linked email.
create index if not exists idx_students_email
  on public.students (email)
  where email is not null;

-- Group rosters.
create index if not exists idx_students_groupe_id
  on public.students (groupe_id)
  where groupe_id is not null;

-- Status filters on /students (Active / Prospect / Inactive lists).
create index if not exists idx_students_status
  on public.students (status);


-- ── attendance ──────────────────────────────────────────────────────────────
-- Single most-used path: roster + session date for a class.
create index if not exists idx_attendance_group_session
  on public.attendance (group_id, session_date);

-- Per-student attendance history (parent portal, student profile page).
create index if not exists idx_attendance_student_session
  on public.attendance (student_id, session_date);


-- ── receipts ────────────────────────────────────────────────────────────────
-- Finance dashboard: receipts in a date window.
create index if not exists idx_receipts_date
  on public.receipts (date);

-- Per-student receipt history.
create index if not exists idx_receipts_student_date
  on public.receipts (student_id, date)
  where student_id is not null;

-- Outstanding-balance reports filter by status.
create index if not exists idx_receipts_statut
  on public.receipts (statut_paiement);


-- ── payments ───────────────────────────────────────────────────────────────
create index if not exists idx_payments_student
  on public.payments (student_id)
  where student_id is not null;

create index if not exists idx_payments_receipt
  on public.payments (receipt_id)
  where receipt_id is not null;


-- ── enrollments ────────────────────────────────────────────────────────────
-- Enrollment workflow page filters by status; admin sees the queue.
create index if not exists idx_enrollments_status
  on public.enrollments (status);

create index if not exists idx_enrollments_student
  on public.enrollments (student_id)
  where student_id is not null;

create index if not exists idx_enrollments_group
  on public.enrollments (group_id)
  where group_id is not null;


-- ── assessments ────────────────────────────────────────────────────────────
create index if not exists idx_assessments_student
  on public.assessments (student_id)
  where student_id is not null;

create index if not exists idx_assessments_group_term
  on public.assessments (group_id, terme)
  where group_id is not null;


-- ── learning_assessments / placement_tests / portfolios ────────────────────
create index if not exists idx_learning_assessments_student
  on public.learning_assessments (student_id)
  where student_id is not null;

create index if not exists idx_placement_tests_status
  on public.placement_tests (status);

create index if not exists idx_placement_tests_student
  on public.placement_tests (student_id)
  where student_id is not null;

create index if not exists idx_portfolios_student
  on public.portfolios (student_id)
  where student_id is not null;

create index if not exists idx_portfolios_teacher
  on public.portfolios (teacher_id)
  where teacher_id is not null;


-- ── certificates / dismissal_logs ──────────────────────────────────────────
create index if not exists idx_certificates_student
  on public.certificates (student_id)
  where student_id is not null;

create index if not exists idx_dismissal_logs_student_ts
  on public.dismissal_logs (student_id, timestamp desc)
  where student_id is not null;


-- ── payroll / leave_requests ───────────────────────────────────────────────
-- Monthly payroll lookups are always (teacher, year, month) — composite
-- avoids two index hops. Also enforce one payroll row per teacher/period
-- (was previously possible to insert duplicates).
create unique index if not exists uq_payroll_teacher_period
  on public.payroll (teacher_id, annee, mois)
  where teacher_id is not null;

create index if not exists idx_payroll_period
  on public.payroll (annee, mois);

create index if not exists idx_leave_requests_teacher
  on public.leave_requests (teacher_id)
  where teacher_id is not null;

create index if not exists idx_leave_requests_status
  on public.leave_requests (status);


-- ── groups ─────────────────────────────────────────────────────────────────
-- "Groups for teacher X" — teacher portal home screen.
create index if not exists idx_groups_teacher
  on public.groups (teacher_id)
  where teacher_id is not null;

-- Current-term group filter.
create index if not exists idx_groups_terme_annee
  on public.groups (terme, annee);


-- ── notifications / messages / announcements ──────────────────────────────
-- Inbox: messages addressed to me, newest first.
create index if not exists idx_messages_to_email_created
  on public.messages (to_user_email, created_at desc)
  where to_user_email is not null;

create index if not exists idx_messages_from_email_created
  on public.messages (from_user_email, created_at desc);

-- Notification outbox + retries.
create index if not exists idx_notifications_recipient
  on public.notifications (recipient_email);

create index if not exists idx_notifications_sent
  on public.notifications (sent, created_at)
  where sent = false;

-- Pinned / audience filters on announcements.
create index if not exists idx_announcements_audience_created
  on public.announcements (audience, created_at desc);


-- ── profiles ───────────────────────────────────────────────────────────────
-- Middleware fetches profile.role on every request — already indexed via PK
-- on `id`, so no extra index needed there. Keep an explicit index for
-- linked_student_id / linked_teacher_id which power the parent/teacher
-- portal lookups.
create index if not exists idx_profiles_linked_student
  on public.profiles (linked_student_id)
  where linked_student_id is not null;

create index if not exists idx_profiles_linked_teacher
  on public.profiles (linked_teacher_id)
  where linked_teacher_id is not null;

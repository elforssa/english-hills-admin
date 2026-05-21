-- ============================================================================
-- 011 · convert required FKs from ON DELETE SET NULL → ON DELETE RESTRICT
--
-- Migration 001 documents the original choice:
--   "Foreign keys use ON DELETE SET NULL per migration spec. This conflicts
--    with the Base44 'required' flag for some FKs (e.g. Attendance.student_id,
--    Assessment.student_id, Receipt-related links, etc.)."
--
-- That choice silently breaks referential integrity. Concretely:
--   • Delete a student → their attendance/receipts/assessments persist with
--     student_id NULL, indistinguishable from rows that never had one.
--   • Delete a teacher → payroll rows lose their owner; running totals
--     for "teacher X this year" silently drop.
--   • Reports filter `where student_id is not null`, hiding deleted-student
--     history without warning the user that anything is missing.
--
-- This migration moves the "required" FKs to ON DELETE RESTRICT, so a delete
-- now fails loudly when there are dependent rows. The application can then:
--   1. Refuse the delete (current behavior is to swallow it), OR
--   2. Move the dependents to a "deleted_students" / archive table first.
--
-- FKs that are genuinely optional (e.g. groups.teacher_id — a group can
-- exist without an assigned teacher; messages.reply_to_id — replies can
-- outlive the original) stay ON DELETE SET NULL.
--
-- Affected tables:
--   attendance.student_id          → RESTRICT
--   attendance.group_id            → RESTRICT
--   assessments.student_id         → RESTRICT
--   receipts.student_id            → RESTRICT
--   payments.student_id            → RESTRICT
--   payments.receipt_id            → RESTRICT
--   enrollments.student_id         → RESTRICT
--   enrollments.group_id           → RESTRICT
--   learning_assessments.student_id → RESTRICT
--   portfolios.student_id          → RESTRICT
--   certificates.student_id        → RESTRICT
--   dismissal_logs.student_id      → RESTRICT
--   payroll.teacher_id             → RESTRICT
--   leave_requests.teacher_id      → RESTRICT
--   authorized_adults.student_id   → RESTRICT
--
-- LEFT alone (optional relationship):
--   groups.teacher_id              → SET NULL  (group can be teacher-less)
--   placement_tests.student_id     → SET NULL  (test can predate enrollment)
--   placement_tests.groupe_affecte_id → SET NULL
--   assessments.group_id           → SET NULL  (group archived, assessment kept)
--   portfolios.teacher_id          → SET NULL
--   notifications.student_id       → SET NULL  (notification log is informational)
--   messages.student_id            → SET NULL
--   messages.reply_to_id           → SET NULL
--   announcements.group_id         → SET NULL
--
-- Pre-flight: this will fail if NULL rows exist for the columns we are
-- about to mark RESTRICT (because nullable columns + RESTRICT is fine,
-- but you almost certainly want NOT NULL too once integrity is enforced).
-- We do NOT add NOT NULL in this migration — historical data may already
-- contain NULLs from prior SET NULL cascades. Add NOT NULL manually after
-- a one-off cleanup if you want the stricter contract.
--
-- Idempotent re-runs: each FK is dropped (if it exists) and re-added.
-- ============================================================================

-- Helper: drop+recreate one FK with the supplied target + delete action.
-- Postgres doesn't expose ALTER CONSTRAINT for ON DELETE actions, so we
-- have to drop and recreate.

-- ── attendance ────────────────────────────────────────────────────────────
alter table public.attendance
  drop constraint if exists attendance_student_id_fkey;
alter table public.attendance
  add  constraint attendance_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

alter table public.attendance
  drop constraint if exists attendance_group_id_fkey;
alter table public.attendance
  add  constraint attendance_group_id_fkey
       foreign key (group_id) references public.groups(id)
       on delete restrict;

-- ── assessments ───────────────────────────────────────────────────────────
alter table public.assessments
  drop constraint if exists assessments_student_id_fkey;
alter table public.assessments
  add  constraint assessments_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

-- ── receipts ──────────────────────────────────────────────────────────────
alter table public.receipts
  drop constraint if exists receipts_student_id_fkey;
alter table public.receipts
  add  constraint receipts_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

-- ── payments ──────────────────────────────────────────────────────────────
alter table public.payments
  drop constraint if exists payments_student_id_fkey;
alter table public.payments
  add  constraint payments_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

alter table public.payments
  drop constraint if exists payments_receipt_id_fkey;
alter table public.payments
  add  constraint payments_receipt_id_fkey
       foreign key (receipt_id) references public.receipts(id)
       on delete restrict;

-- ── enrollments ───────────────────────────────────────────────────────────
alter table public.enrollments
  drop constraint if exists enrollments_student_id_fkey;
alter table public.enrollments
  add  constraint enrollments_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

alter table public.enrollments
  drop constraint if exists enrollments_group_id_fkey;
alter table public.enrollments
  add  constraint enrollments_group_id_fkey
       foreign key (group_id) references public.groups(id)
       on delete restrict;

-- ── learning_assessments ──────────────────────────────────────────────────
alter table public.learning_assessments
  drop constraint if exists learning_assessments_student_id_fkey;
alter table public.learning_assessments
  add  constraint learning_assessments_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

-- ── portfolios ────────────────────────────────────────────────────────────
alter table public.portfolios
  drop constraint if exists portfolios_student_id_fkey;
alter table public.portfolios
  add  constraint portfolios_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

-- ── certificates ──────────────────────────────────────────────────────────
alter table public.certificates
  drop constraint if exists certificates_student_id_fkey;
alter table public.certificates
  add  constraint certificates_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

-- ── dismissal_logs ────────────────────────────────────────────────────────
alter table public.dismissal_logs
  drop constraint if exists dismissal_logs_student_id_fkey;
alter table public.dismissal_logs
  add  constraint dismissal_logs_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

-- ── payroll ───────────────────────────────────────────────────────────────
alter table public.payroll
  drop constraint if exists payroll_teacher_id_fkey;
alter table public.payroll
  add  constraint payroll_teacher_id_fkey
       foreign key (teacher_id) references public.teachers(id)
       on delete restrict;

-- ── leave_requests ────────────────────────────────────────────────────────
alter table public.leave_requests
  drop constraint if exists leave_requests_teacher_id_fkey;
alter table public.leave_requests
  add  constraint leave_requests_teacher_id_fkey
       foreign key (teacher_id) references public.teachers(id)
       on delete restrict;

-- ── authorized_adults ─────────────────────────────────────────────────────
-- Pickup authorization makes no sense without the student.
alter table public.authorized_adults
  drop constraint if exists authorized_adults_student_id_fkey;
alter table public.authorized_adults
  add  constraint authorized_adults_student_id_fkey
       foreign key (student_id) references public.students(id)
       on delete restrict;

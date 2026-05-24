-- =============================================================================
-- 020_required_emails.sql
--
-- Lock down email columns that RLS depends on. The parent-portal SELECT
-- policy in 006 matches on
--   parent_email = public.get_my_email()  OR  email = public.get_my_email()
-- so a NULL on both sides makes a student invisible to their parent and
-- silently breaks the linkage.
--
-- Constraints applied:
--   1. teachers.email     NOT NULL  — every teacher must be reachable for
--      payroll / scheduling notifications.
--   2. students            CHECK (email IS NOT NULL OR parent_email IS NOT NULL)
--      — every student must have *some* contact email. Adults usually have
--      their own; young learners use the parent email. Either is fine, but
--      both NULL is not.
--   3. teachers.email     UNIQUE   — prevents two teacher rows tied to the
--      same auth account, which would break RLS scoping.
--
-- Safe to apply on an empty database (no production data per Q3 of the
-- audit follow-up). On a populated DB we would first need to scrub
-- NULL-email rows before adding these constraints.
-- =============================================================================

-- ── teachers.email NOT NULL + UNIQUE ─────────────────────────────────────
alter table public.teachers
  alter column email set not null;

-- Drop a stale unique constraint if a previous attempt left one behind, then
-- re-create idempotently. Postgres has no `create unique constraint if not
-- exists`, so we wrap it in a do-block.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'teachers_email_key'
       and conrelid = 'public.teachers'::regclass
  ) then
    alter table public.teachers
      add constraint teachers_email_key unique (email);
  end if;
end $$;


-- ── students: at least one contact email required ────────────────────────
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'students_contact_email_present'
       and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      drop constraint students_contact_email_present;
  end if;
end $$;

alter table public.students
  add constraint students_contact_email_present
  check (
    email is not null
    or parent_email is not null
  );


-- ── Update the public-inscription path documentation ─────────────────────
-- Migration 016 / API route /api/public/inscription must guarantee at least
-- one of these fields is populated before INSERT. The route already collects
-- email as optional — see app code change in this branch which now requires
-- the form to capture at least one address.
comment on constraint students_contact_email_present on public.students is
  'Enforces that every student is reachable by email — either their own '
  '(adults) or their parent''s (young learners). Both NULL is rejected.';

-- Front-desk speed: allow creating a student/receipt with just a name + payment
-- and complete the rest later. Two rules that previously forced contact info are
-- relaxed to optional:
--
--   1. students: drop the "at least one email" CHECK (was migration 020). Email
--      becomes optional; the parent<->child portal link simply activates later,
--      automatically, once a parent_email is filled in (RLS matches on email).
--   2. receipts.telephone: drop NOT NULL.
--
-- Missing info is surfaced by the "À compléter" filter on the students list.

alter table public.students
  drop constraint if exists students_contact_email_present;

alter table public.receipts
  alter column telephone drop not null;

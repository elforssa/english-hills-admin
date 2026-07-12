-- Add a third program value to session_type: 'Communication Junior'.
-- Juniors (10-16) are a distinct program from Summer Camp and the yearly track.
-- Widen the CHECK constraint added in 029; existing rows are unaffected.

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_session_type_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_session_type_check
  CHECK (session_type IN ('Yearly', 'Summer Camp', 'Communication Junior'));

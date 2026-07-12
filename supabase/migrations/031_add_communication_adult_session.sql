-- Add a fourth program value to session_type: 'Communication Adult'.
-- The adult counterpart to Communication Junior (17+ conversation course).
-- Widen the CHECK constraint; existing rows are unaffected.

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_session_type_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_session_type_check
  CHECK (session_type IN ('Yearly', 'Summer Camp', 'Communication Junior', 'Communication Adult'));

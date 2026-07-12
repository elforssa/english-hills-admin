-- Add a fifth program value to session_type: 'One-to-One'.
-- Private / individual lessons (cours particulier), distinct from the group
-- programs. Widen the CHECK constraint; existing rows are unaffected.
-- Note: the yearly program ('Cours Annuel') maps to the existing 'Yearly' value.

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_session_type_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_session_type_check
  CHECK (session_type IN ('Yearly', 'Summer Camp', 'Communication Junior', 'Communication Adult', 'One-to-One'));

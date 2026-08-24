-- Add a sixth program value to session_type: 'Mise à niveau'.
-- Widen the CHECK constraints on both students and receipts.

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_session_type_check;
ALTER TABLE public.students
  ADD CONSTRAINT students_session_type_check
  CHECK (session_type IN (
    'Yearly', 'Summer Camp', 'Communication Junior', 'Communication Adult', 'One-to-One', 'Mise à niveau'
  ));

ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_session_type_check;
ALTER TABLE public.receipts
  ADD CONSTRAINT receipts_session_type_check
  CHECK (session_type IS NULL OR session_type IN (
    'Yearly', 'Summer Camp', 'Communication Junior', 'Communication Adult', 'One-to-One', 'Mise à niveau'
  ));

-- Temporary holding category for students whose current programme is unknown.
-- This keeps the value explicit and filterable instead of overloading Yearly.

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_session_type_check;
ALTER TABLE public.students
  ADD CONSTRAINT students_session_type_check
  CHECK (session_type IN (
    'Yearly', 'Summer Camp', 'Communication Junior', 'Communication Adult',
    'One-to-One', 'Mise à niveau', 'Other'
  ));

ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_session_type_check;
ALTER TABLE public.receipts
  ADD CONSTRAINT receipts_session_type_check
  CHECK (session_type IS NULL OR session_type IN (
    'Yearly', 'Summer Camp', 'Communication Junior', 'Communication Adult',
    'One-to-One', 'Mise à niveau', 'Other'
  ));

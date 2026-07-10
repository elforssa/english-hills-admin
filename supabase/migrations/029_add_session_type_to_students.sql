-- Add a session_type dimension to students: distinguishes yearly, level-based
-- students from workshop-based summer-camp students. This is independent of
-- age_category and niveau_cefr — a student can be a Young Learner AND Summer Camp.
-- Existing rows default to 'Yearly', preserving all current data; the public
-- inscription and CSV-import paths inherit the default without changes.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'Yearly'
    CHECK (session_type IN ('Yearly', 'Summer Camp'));

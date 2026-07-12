-- Add session_type (program) to receipts so a receipt records which program it
-- is for (Summer Camp / Yearly / Communication Junior / Communication Adult /
-- One-to-One). This replaces the ad-hoc use of duree_cours for the program name
-- and lets Finance report revenue by program. Nullable: existing receipts and
-- walk-in receipts may have none.

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS session_type text
    CHECK (session_type IS NULL OR session_type IN
      ('Yearly', 'Summer Camp', 'Communication Junior', 'Communication Adult', 'One-to-One'));

-- Add optional discount percentage (0–100) to receipts.
-- Existing rows default to 0 (no discount), preserving all current data.
-- effective_total = montant_total * (1 - remise / 100)

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS remise numeric(5,2) NOT NULL DEFAULT 0
    CHECK (remise >= 0 AND remise <= 100);

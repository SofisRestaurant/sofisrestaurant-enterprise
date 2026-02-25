ALTER TABLE loyalty_ledger
ADD COLUMN IF NOT EXISTS prev_hash text,
ADD COLUMN IF NOT EXISTS row_hash text;
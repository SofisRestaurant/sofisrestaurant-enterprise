ALTER TABLE loyalty_accounts
ADD COLUMN IF NOT EXISTS last_award_at timestamptz,
ADD COLUMN IF NOT EXISTS last_redeem_at timestamptz;
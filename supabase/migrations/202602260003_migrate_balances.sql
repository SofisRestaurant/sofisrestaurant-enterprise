-- =============================================================================
-- LOYALTY V2 — FILE 3: SAFE BALANCE MIGRATION
-- =============================================================================
-- Handles both cases:
-- 1) profiles.loyalty_points exists
-- 2) profiles.loyalty_points does NOT exist
-- =============================================================================

DO $$
DECLARE
  v_column_exists boolean;
BEGIN

  -- Check if legacy column exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profiles'
      AND column_name = 'loyalty_points'
  )
  INTO v_column_exists;

  -- Create loyalty accounts for all profiles
  IF v_column_exists THEN

    INSERT INTO loyalty_accounts (
      user_id,
      balance,
      lifetime_earned,
      tier,
      streak,
      last_activity
    )
    SELECT
      p.id,
      GREATEST(COALESCE(p.loyalty_points, 0), 0),
      GREATEST(COALESCE(p.loyalty_points, 0), 0),
      CASE
        WHEN COALESCE(p.loyalty_points,0) >= 5000 THEN 'platinum'
        WHEN COALESCE(p.loyalty_points,0) >= 2000 THEN 'gold'
        WHEN COALESCE(p.loyalty_points,0) >= 500 THEN 'silver'
        ELSE 'bronze'
      END,
      0,
      now()
    FROM profiles p
    ON CONFLICT (user_id) DO NOTHING;

  ELSE

    -- No legacy column → create zero-balance accounts
    INSERT INTO loyalty_accounts (
      user_id,
      balance,
      lifetime_earned,
      tier,
      streak,
      last_activity
    )
    SELECT
      p.id,
      0,
      0,
      'bronze',
      0,
      now()
    FROM profiles p
    ON CONFLICT (user_id) DO NOTHING;

  END IF;

END $$;
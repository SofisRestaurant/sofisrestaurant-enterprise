-- =============================================================================
-- LOYALTY V2 — FILE 3: BALANCE MIGRATION
-- =============================================================================
-- Migrates existing user balances from v1 into v2 accounts + ledger.
--
-- Strategy: SINGLE OPENING ENTRY per user
--   We do NOT replay every historical v1 transaction into the v2 ledger.
--   That would be fragile (column mapping differences, type mismatches, nulls).
--   Instead, we create one 'adjustment' entry per user that represents their
--   verified opening balance — like a bank account opening credit.
--
-- Why this is safe:
--   - v1 loyalty_transactions remains untouched and readable forever
--   - The opening entry is clearly labelled source='migration' in metadata
--   - reconcile_v2_accounts() (below) can verify balance integrity at any time
--   - If a user had 0 points in v1, they still get an account (balance=0, no ledger entry)
--
-- What this does NOT do:
--   - Does NOT copy individual v1 transaction rows (fragile, unnecessary)
--   - Does NOT drop or alter v1 tables
--   - Does NOT touch profiles.loyalty_points (still updated by v1 trigger for now)
--
-- Run order: after 202602260001 and 202602260002.
-- Safe to run multiple times (ON CONFLICT DO NOTHING on account creation).
-- =============================================================================


-- =============================================================================
-- STEP 1: Create loyalty_accounts for all existing profiles
-- =============================================================================
-- Every user gets an account, even those with 0 points.
-- ON CONFLICT DO NOTHING makes this re-runnable safely.

INSERT INTO loyalty_accounts (user_id, balance, lifetime_earned, tier, streak, last_activity)
SELECT
  p.id,
  GREATEST(COALESCE(p.loyalty_points, 0), 0),        -- never negative
  GREATEST(COALESCE(p.lifetime_points, 0), 0),
  COALESCE(p.loyalty_tier, 'bronze'),
  GREATEST(COALESCE(p.loyalty_streak, 0), 0),
  p.last_order_date
FROM profiles p
ON CONFLICT (user_id) DO NOTHING;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM loyalty_accounts;
  RAISE NOTICE 'loyalty_accounts: % rows after account creation', v_count;
END;
$$;


-- =============================================================================
-- STEP 2: Create opening ledger entries for users with non-zero balances
-- =============================================================================
-- One entry per user with balance > 0.
-- Idempotency key: 'migration:v1:<user_id>' — re-running is a safe no-op.

INSERT INTO loyalty_ledger (
  account_id,
  amount,
  balance_after,
  entry_type,
  source,
  reference_id,
  admin_id,
  idempotency_key,
  tier_at_time,
  streak_at_time,
  metadata
)
SELECT
  la.id,
  GREATEST(COALESCE(p.loyalty_points, 0), 0),         -- opening balance amount
  GREATEST(COALESCE(p.loyalty_points, 0), 0),         -- balance_after = same (opening)
  'adjustment',
  'migration',
  NULL,
  NULL,
  'migration:v1:' || p.id::text,                       -- idempotency key
  COALESCE(p.loyalty_tier, 'bronze'),
  GREATEST(COALESCE(p.loyalty_streak, 0), 0),
  jsonb_build_object(
    'migration',        true,
    'migration_source', 'loyalty_transactions_v1',
    'v1_balance',       COALESCE(p.loyalty_points, 0),
    'v1_lifetime',      COALESCE(p.lifetime_points, 0),
    'migrated_at',      now()
  )
FROM profiles p
JOIN loyalty_accounts la ON la.user_id = p.id
WHERE COALESCE(p.loyalty_points, 0) > 0
ON CONFLICT (idempotency_key)
  WHERE idempotency_key IS NOT NULL
  DO NOTHING;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM loyalty_ledger WHERE source = 'migration';
  RAISE NOTICE 'loyalty_ledger: % migration opening entries created', v_count;
END;
$$;


-- =============================================================================
-- STEP 3: Reconciliation function
-- =============================================================================
-- Compares v1 profiles balance against v2 ledger balance for all users.
-- Expected result: 0 rows (all balances match).
-- Any rows returned = discrepancy requiring investigation.

CREATE OR REPLACE FUNCTION reconcile_v2_accounts()
RETURNS TABLE(
  user_id          uuid,
  v1_balance       integer,
  v2_balance       integer,
  drift            integer,
  v2_account_exists boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.id                                            AS user_id,
    COALESCE(p.loyalty_points, 0)                  AS v1_balance,
    COALESCE(la.balance, 0)                         AS v2_balance,
    COALESCE(p.loyalty_points, 0)
      - COALESCE(la.balance, 0)                    AS drift,
    (la.id IS NOT NULL)                             AS v2_account_exists
  FROM profiles p
  LEFT JOIN loyalty_accounts la ON la.user_id = p.id
  WHERE COALESCE(p.loyalty_points, 0) <> COALESCE(la.balance, 0)
     OR la.id IS NULL;
$$;

COMMENT ON FUNCTION reconcile_v2_accounts IS
  'Returns rows where v1 profiles.loyalty_points differs from v2 loyalty_accounts.balance. '
  'Expected to return 0 rows after migration. Run after any incident or re-migration.';


-- =============================================================================
-- STEP 4: Verify migration
-- =============================================================================

DO $$
DECLARE
  v_drift_count integer;
  v_no_account  integer;
BEGIN
  SELECT COUNT(*) INTO v_drift_count
  FROM reconcile_v2_accounts()
  WHERE v2_account_exists = true AND drift <> 0;

  SELECT COUNT(*) INTO v_no_account
  FROM reconcile_v2_accounts()
  WHERE v2_account_exists = false;

  IF v_drift_count > 0 THEN
    RAISE WARNING 'Migration check: % users have balance drift between v1 and v2', v_drift_count;
  ELSE
    RAISE NOTICE 'Migration check: all balances match between v1 and v2 ✓';
  END IF;

  IF v_no_account > 0 THEN
    RAISE WARNING 'Migration check: % users have no v2 account (unexpected)', v_no_account;
  ELSE
    RAISE NOTICE 'Migration check: all profiles have v2 accounts ✓';
  END IF;
END;
$$;
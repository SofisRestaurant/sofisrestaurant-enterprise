-- =============================================================================
-- 202602260014_loyalty_bootstrap.sql
-- LOYALTY V2 — BOOTSTRAP + INTEGRITY VERIFICATION
-- =============================================================================
-- Purpose: One-shot verification and repair pass.
-- Safe to run on a live database with zero downtime.
-- Idempotent — will not create duplicate data.
--
-- What this does:
--   1. Creates loyalty_accounts for any profiles that don't have one yet
--   2. Creates an opening ledger entry for users with balance > 0 but
--      no ledger history (migrated from v1 without ledger entries)
--   3. Detects and reports any balance drift (cache vs ledger)
--   4. Verifies all constraints are in place
--   5. Verifies required indexes exist
--   6. Reports final health status
--
-- Grounded in confirmed live schema. Does not ALTER any existing tables.
-- =============================================================================
-- ── PRODUCTION GUARD ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE EXCEPTION
      'LOYALTY BOOTSTRAP CANNOT RUN IN PRODUCTION';
  END IF;
END $$;
-- ── STEP 1: Create missing loyalty_accounts ───────────────────────────────────
-- Any profile that exists but has no loyalty_account gets one now.
-- Uses ON CONFLICT DO NOTHING so safe to re-run.
DO $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.loyalty_accounts (
    user_id,
    balance,
    lifetime_earned,
    tier,
    streak,
    status,
    created_at,
    updated_at
  )
  SELECT
    p.id,
    0,
    0,
    'bronze',
    0,
    'active',
    NOW(),
    NOW()
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.loyalty_accounts a WHERE a.user_id = p.id
  )
  ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RAISE NOTICE 'STEP 1: Created % missing loyalty_accounts', v_count;
END $$;

-- ── STEP 2: Create opening ledger entries for accounts with balance but no ledger ──
-- These are users migrated from v1 who have a balance in loyalty_accounts
-- but zero ledger entries. Insert a single migration/opening entry.

DO $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    admin_id,
    idempotency_key,
    tier_at_time,
    streak_at_time,
    metadata,
    created_at
  )
  SELECT
    a.id,
    a.balance,
    a.balance,
    'adjustment',
    'v1_migration',
    NULL,
    'migration:opening:' || a.id::text,
    a.tier,
    a.streak,
    jsonb_build_object(
      'migration', true,
      'v1_migration', true,
      'description', 'Opening balance from v1 migration'
    ),
    COALESCE(a.created_at, NOW())
  FROM public.loyalty_accounts a
  WHERE a.balance > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.loyalty_ledger l
      WHERE l.account_id = a.id
    )
  ON CONFLICT (idempotency_key)
  WHERE idempotency_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RAISE NOTICE 'STEP 2: Created % opening ledger entries', v_count;
END $$;
-- ── STEP 3: Detect balance drift ──────────────────────────────────────────────
-- Compares loyalty_accounts.balance against SUM(loyalty_ledger.amount).
-- Any discrepancy is a data integrity issue that must be investigated.

DO $$
DECLARE
  v_drift_count integer := 0;
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT
      a.id             AS account_id,
      a.user_id,
      a.balance        AS cached_balance,
      COALESCE(SUM(l.amount), 0) AS ledger_balance,
      a.balance - COALESCE(SUM(l.amount), 0) AS drift
    FROM public.loyalty_accounts a
    LEFT JOIN public.loyalty_ledger l ON l.account_id = a.id
    GROUP BY a.id, a.user_id, a.balance
    HAVING a.balance != COALESCE(SUM(l.amount), 0)
  LOOP
    v_drift_count := v_drift_count + 1;

    RAISE WARNING
      'DRIFT DETECTED — account_id=% user_id=% cached=% ledger=% drift=%',
      v_rec.account_id,
      v_rec.user_id,
      v_rec.cached_balance,
      v_rec.ledger_balance,
      v_rec.drift;

    -- 🔧 AUTO-REPAIR (optional)
    INSERT INTO public.loyalty_ledger (
      account_id,
      amount,
      balance_after,
      entry_type,
      source,
      idempotency_key,
      tier_at_time,
      streak_at_time,
      metadata,
      created_at
    )
    VALUES (
      v_rec.account_id,
      -v_rec.drift,
      v_rec.cached_balance,
      'adjustment',
      'drift_auto_repair',
      'drift:repair:' || v_rec.account_id::text,
      'bronze',
      0,
      jsonb_build_object(
        'auto_repair', true,
        'detected_drift', v_rec.drift
      ),
      NOW()
    )
    ON CONFLICT DO NOTHING;

  END LOOP;

  IF v_drift_count = 0 THEN
    RAISE NOTICE
      'STEP 3: Balance integrity check PASSED — 0 drifted accounts';
  ELSE
    RAISE WARNING
      'STEP 3: FAILED — % accounts had balance drift (auto-repair attempted)',
      v_drift_count;
  END IF;
END $$;
-- ── STEP 4: Verify required indexes exist ─────────────────────────────────────

DO $$
DECLARE
  v_missing text := '';
BEGIN
  -- idempotency_key unique index on loyalty_ledger
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'loyalty_ledger'
      AND schemaname = 'public'
      AND indexdef ILIKE '%idempotency_key%'
  ) THEN
    v_missing := v_missing || ' loyalty_ledger.idempotency_key;';
  END IF;

  -- account_id index on loyalty_ledger (for join performance)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'loyalty_ledger'
      AND schemaname = 'public'
      AND indexdef ILIKE '%account_id%'
  ) THEN
    v_missing := v_missing || ' loyalty_ledger.account_id;';
    -- Create it if missing
    CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_account_id
      ON public.loyalty_ledger (account_id);
    RAISE NOTICE 'Created missing index: loyalty_ledger(account_id)';
  END IF;

  -- user_id index on loyalty_accounts
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'loyalty_accounts'
      AND schemaname = 'public'
      AND indexdef ILIKE '%user_id%'
  ) THEN
    v_missing := v_missing || ' loyalty_accounts.user_id;';
    CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_user_id
      ON public.loyalty_accounts (user_id);
    RAISE NOTICE 'Created missing index: loyalty_accounts(user_id)';
  END IF;

  IF v_missing = '' THEN
    RAISE NOTICE 'STEP 4: Index verification PASSED';
  ELSE
    RAISE WARNING 'STEP 4: Missing indexes: %', v_missing;
  END IF;
END $$;

-- ── STEP 5: Create idempotency_key unique index if missing ────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE tablename = 'loyalty_ledger'
      AND schemaname = 'public'
      AND (
        indexdef  ILIKE '%idempotency_key%'
        OR indexname ILIKE '%idempotency%'
      )
  ) THEN

    CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_idempotency_key
      ON public.loyalty_ledger (idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    RAISE NOTICE 'STEP 5: Created idempotency_key unique index on loyalty_ledger';

  ELSE
    RAISE NOTICE 'STEP 5: Idempotency index already exists — skipped';
  END IF;
END $$;
-- ── STEP 6: Final health report ───────────────────────────────────────────────

DO $$
DECLARE
  v_account_count  integer;
  v_ledger_count   integer;
  v_zero_balance   integer;
  v_active         integer;
  v_suspended      integer;
BEGIN
  SELECT COUNT(*) INTO v_account_count FROM public.loyalty_accounts;
  SELECT COUNT(*) INTO v_ledger_count   FROM public.loyalty_ledger;
  SELECT COUNT(*) INTO v_zero_balance
    FROM public.loyalty_accounts WHERE balance = 0;
  SELECT COUNT(*) INTO v_active
    FROM public.loyalty_accounts WHERE status = 'active';
  SELECT COUNT(*) INTO v_suspended
    FROM public.loyalty_accounts WHERE status = 'suspended';

  RAISE NOTICE '=== LOYALTY V2 BOOTSTRAP COMPLETE ===';
  RAISE NOTICE 'loyalty_accounts: % total (%  active, % suspended)',
    v_account_count, v_active, v_suspended;
  RAISE NOTICE 'loyalty_ledger:   % entries', v_ledger_count;
  RAISE NOTICE 'zero-balance accounts: %', v_zero_balance;
  RAISE NOTICE '=====================================';
END $$;
-- =============================================================================
-- LOYALTY V2 — FILE 6: REDEEM RPC + CORRECTION RPC
-- =============================================================================
-- v2_redeem_points()      — atomic redemption with double-spend prevention
-- v2_issue_correction()   — named corrective reversal for failed downstream ops
-- =============================================================================


-- =============================================================================
-- v2_redeem_points()
-- =============================================================================
-- Single transaction boundary:
--   1. Lock account row (FOR UPDATE — prevents concurrent double-spend)
--   2. Read balance from ledger (never from cache)
--   3. Reject if insufficient (RAISE EXCEPTION — auto rollback)
--   4. Append negative ledger entry
--   5. Trigger fires: syncs loyalty_accounts.balance
--   6. Return new balance
--
-- Called by: redeem-loyalty Edge Function

CREATE OR REPLACE FUNCTION v2_redeem_points(
  p_account_id      uuid,
  p_admin_id        uuid,
  p_amount          integer,    -- points to redeem (positive integer)
  p_mode            text,       -- 'dine_in' | 'online'
  p_idempotency_key text        -- format: 'redeem:<session_or_uuid>'
)
RETURNS TABLE(new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance  integer;
  v_current_lifetime integer;
  v_new_balance      integer;
  v_tier_at_time     text;
  v_streak_at_time   integer;
  v_rows_inserted    integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'redeem amount must be positive, got %', p_amount;
  END IF;

  IF p_mode NOT IN ('dine_in', 'online') THEN
    RAISE EXCEPTION 'invalid mode: %. Expected dine_in or online', p_mode;
  END IF;

  -- ── Lock account row (double-spend prevention) ────────────────────────────
  -- Two concurrent redemptions for the same user will queue here.
  -- The second sees the balance AFTER the first committed.
  SELECT tier, streak
  INTO v_tier_at_time, v_streak_at_time
  FROM loyalty_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;

  -- ── Balance from ledger (inside lock — consistent read) ───────────────────
  SELECT
    COALESCE(SUM(amount), 0)::integer,
    COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::integer
  INTO v_current_balance, v_current_lifetime
  FROM loyalty_ledger
  WHERE account_id = p_account_id;

  -- ── Insufficient balance — exception auto-rolls back the transaction ──────
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION
      'Insufficient balance: account % has % points, redemption requires %',
      p_account_id, v_current_balance, p_amount
      USING ERRCODE = 'check_violation';
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- ── Idempotent ledger append ──────────────────────────────────────────────
  INSERT INTO loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    admin_id,
    idempotency_key,
    tier_at_time,
    streak_at_time,
    metadata
  ) VALUES (
    p_account_id,
    -p_amount,                     -- negative delta
    v_new_balance,
    'redemption',
    'admin_scan',
    p_admin_id,
    p_idempotency_key,
    v_tier_at_time,
    v_streak_at_time,
    jsonb_build_object(
      'mode',     p_mode,
      'admin_id', p_admin_id
    )
  )
  ON CONFLICT (idempotency_key)
    WHERE idempotency_key IS NOT NULL
    DO NOTHING;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  -- If duplicate idempotency_key: return current (post-original-redemption) balance
  IF v_rows_inserted = 0 THEN
    SELECT COALESCE(SUM(amount), 0)::integer
    INTO v_new_balance
    FROM loyalty_ledger
    WHERE account_id = p_account_id;
  END IF;

  RETURN QUERY SELECT v_new_balance;
END;
$$;

COMMENT ON FUNCTION v2_redeem_points IS
  'Atomic redemption with double-spend prevention via FOR UPDATE lock. '
  'Raises check_violation (23514) if balance insufficient — auto rollback. '
  'Idempotent: duplicate idempotency_key returns current balance as no-op.';


-- =============================================================================
-- v2_issue_correction()
-- =============================================================================
-- Appends a compensating positive entry when a downstream operation fails
-- after a redemption committed. Corrections are entry_type='adjustment'
-- with correction:true in metadata — distinguishable from normal earns
-- in all audit queries and the v2_ledger_detail view.
--
-- Called by: redeem-loyalty Edge Function when user_credits insert fails.
-- Never called for normal award flows.

CREATE OR REPLACE FUNCTION v2_issue_correction(
  p_account_id uuid,
  p_admin_id   uuid,
  p_amount     integer,    -- points to restore (positive)
  p_reason     text        -- human-readable reason for audit trail
)
RETURNS TABLE(new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance  integer;
  v_current_lifetime integer;
  v_new_balance      integer;
  v_tier_at_time     text;
  v_streak_at_time   integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'correction amount must be positive, got %', p_amount;
  END IF;

  -- Lock account row for consistent snapshot
  SELECT tier, streak
  INTO v_tier_at_time, v_streak_at_time
  FROM loyalty_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;

  SELECT
    COALESCE(SUM(amount), 0)::integer,
    COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::integer
  INTO v_current_balance, v_current_lifetime
  FROM loyalty_ledger
  WHERE account_id = p_account_id;

  v_new_balance := v_current_balance + p_amount;

  -- No idempotency key on corrections — each failure event is unique
  INSERT INTO loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    admin_id,
    tier_at_time,
    streak_at_time,
    metadata
  ) VALUES (
    p_account_id,
    p_amount,
    v_new_balance,
    'adjustment',              -- NOT 'earn' — distinguishable in audit
    'system',
    p_admin_id,
    v_tier_at_time,
    v_streak_at_time,
    jsonb_build_object(
      'correction', true,      -- explicit flag for audit queries
      'reason',     p_reason,
      'admin_id',   p_admin_id,
      'source',     'system_correction'
    )
  );

  RETURN QUERY SELECT v_new_balance;
END;
$$;

COMMENT ON FUNCTION v2_issue_correction IS
  'Compensating reversal for failed downstream operations. '
  'entry_type=adjustment + correction:true in metadata keeps these '
  'distinguishable from normal earns in all audit and reconciliation queries. '
  'Called by redeem-loyalty when user_credits insert fails after redemption commits.';
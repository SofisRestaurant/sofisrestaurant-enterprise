-- =============================================================================
-- LOYALTY V2 — FILE 5: AWARD RPC
-- =============================================================================
-- v2_award_points()
--
-- Single transaction boundary for the entire award operation:
--   1. Lock account row (serialises concurrent awards per user)
--   2. Read balance from ledger (source of truth — never from cache)
--   3. Compute new lifetime and resolve tier (SQL — never TypeScript)
--   4. Append ledger entry with ON CONFLICT DO NOTHING (idempotency)
--   5. Trigger fires: syncs loyalty_accounts.balance + lifetime_earned
--   6. Update tier + streak on account (same transaction)
--   7. Return new state
--
-- Called by: award-loyalty-qr Edge Function
-- Replaces: award_loyalty_points_atomic() from migration 007
-- =============================================================================

CREATE OR REPLACE FUNCTION v2_award_points(
  p_account_id    uuid,       -- loyalty_accounts.id
  p_admin_id      uuid,       -- staff who scanned
  p_amount        integer,    -- final points to award (post-multiplier, computed by Edge)
  p_base_points   integer,    -- pre-multiplier (audit only)
  p_tier_at_time  text,       -- tier at scan time (audit only)
  p_tier_mult     numeric,    -- tier multiplier applied (audit only)
  p_streak        integer,    -- new streak count (computed by Edge)
  p_streak_mult   numeric,    -- streak multiplier (audit only)
  p_amount_cents  integer,    -- purchase amount in cents (audit only)
  p_idempotency_key text      -- format: 'admin_scan:<order_id_or_uuid>'
)
RETURNS TABLE(
  new_balance     integer,
  new_lifetime    integer,
  new_tier        text,
  tier_changed    boolean,
  was_duplicate   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_tier       text;
  v_old_balance    integer;
  v_old_lifetime   integer;
  v_new_balance    integer;
  v_new_lifetime   integer;
  v_new_tier       text;
  v_rows_inserted  integer;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'award amount must be non-negative, got %', p_amount;
  END IF;

  -- ── Lock account row ──────────────────────────────────────────────────────
  -- Serialises concurrent awards. Without this, two simultaneous scans could
  -- both read the same balance and produce incorrect balance_after snapshots.
  SELECT tier
  INTO v_old_tier
  FROM loyalty_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;

  -- ── Read balances from ledger (source of truth) ───────────────────────────
  SELECT
    COALESCE(SUM(amount), 0)::integer,
    COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::integer
  INTO v_old_balance, v_old_lifetime
  FROM loyalty_ledger
  WHERE account_id = p_account_id;

  v_new_balance  := v_old_balance  + p_amount;
  v_new_lifetime := v_old_lifetime + p_amount;   -- lifetime counts earns only
  v_new_tier     := v2_resolve_tier(v_new_lifetime);

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
    p_amount,
    v_new_balance,
    'earn',
    'admin_scan',
    p_admin_id,
    p_idempotency_key,
    p_tier_at_time,
    p_streak,
    jsonb_build_object(
      'base_points',   p_base_points,
      'tier_mult',     p_tier_mult,
      'streak_mult',   p_streak_mult,
      'amount_cents',  p_amount_cents,
      'admin_id',      p_admin_id
    )
  )
  ON CONFLICT (idempotency_key)
    WHERE idempotency_key IS NOT NULL
    DO NOTHING;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  -- ── Handle duplicate (idempotent no-op) ──────────────────────────────────
  IF v_rows_inserted = 0 THEN
    -- Re-read current state — may differ from computed values above
    SELECT
      COALESCE(SUM(amount), 0)::integer,
      COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::integer
    INTO v_new_balance, v_new_lifetime
    FROM loyalty_ledger
    WHERE account_id = p_account_id;

    v_new_tier := v2_resolve_tier(v_new_lifetime);

    RETURN QUERY SELECT
      v_new_balance, v_new_lifetime, v_new_tier,
      false,   -- tier_changed: irrelevant for duplicate
      true;    -- was_duplicate
    RETURN;
  END IF;

  -- ── trg_loyalty_ledger_sync_balance fires here (AFTER INSERT) ─────────────
  -- loyalty_accounts.balance and lifetime_earned are now current.
  -- We still update tier + streak in the same transaction.

  -- ── Update game-state fields (tier + streak) ──────────────────────────────
  UPDATE loyalty_accounts
  SET
    tier          = v_new_tier,
    streak        = p_streak,
    last_activity = CURRENT_DATE
    -- balance + lifetime_earned: managed by trigger above
  WHERE id = p_account_id;

  RETURN QUERY SELECT
    v_new_balance,
    v_new_lifetime,
    v_new_tier,
    (v_new_tier <> v_old_tier),  -- tier_changed
    false;                        -- was_duplicate: no
END;
$$;

COMMENT ON FUNCTION v2_award_points IS
  'Atomic award function for v2 ledger. Single transaction boundary for: '
  'account lock, balance read, ledger append, tier resolve, streak update. '
  'Idempotent: duplicate idempotency_key is a silent no-op. '
  'Called exclusively by award-loyalty-qr Edge Function.';
-- =============================================================================
-- LOYALTY CHECKOUT RESERVE MIGRATION
-- File: supabase/migrations/YYYYMMDD_loyalty_checkout_reserve.sql
--
-- Run BEFORE deploying create-checkout or any frontend changes.
-- Safe to re-run — all statements use IF EXISTS / OR REPLACE / ON CONFLICT.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend entry_type CHECK constraint
--    Adds 'checkout_reserve' and 'checkout_release' to the allowed values.
--    Must DROP + ADD — PostgreSQL has no ALTER CONSTRAINT syntax for CHECKs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.loyalty_ledger
  DROP CONSTRAINT loyalty_ledger_entry_type_check;

ALTER TABLE public.loyalty_ledger
  ADD CONSTRAINT loyalty_ledger_entry_type_check
  CHECK (entry_type = ANY (ARRAY[
    'earn'::text,
    'redeem'::text,
    'adjustment'::text,
    'expiry'::text,
    'correction'::text,
    'checkout_reserve'::text,   -- points held at checkout start (pre-payment)
    'checkout_release'::text    -- points restored when session expires/is abandoned
  ]));

-- ---------------------------------------------------------------------------
-- 2. Add loyalty columns to pending_carts
--    These let the webhook find reservation context without re-parsing
--    Stripe metadata — faster and more reliable.
-- ---------------------------------------------------------------------------
ALTER TABLE public.pending_carts
  ADD COLUMN IF NOT EXISTS loyalty_account_id      uuid
    REFERENCES public.loyalty_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loyalty_reserved_points integer
    DEFAULT 0
    CHECK (loyalty_reserved_points >= 0),
  ADD COLUMN IF NOT EXISTS loyalty_discount_cents  integer
    DEFAULT 0
    CHECK (loyalty_discount_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_pending_carts_loyalty_account
  ON public.pending_carts (loyalty_account_id)
  WHERE loyalty_account_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Ensure loyalty_accounts has last_redeem_at
--    The webhook's finalizeLoyaltyReserve() writes this on payment success.
--    Add IF NOT EXISTS — it may already exist in your schema.
-- ---------------------------------------------------------------------------
ALTER TABLE public.loyalty_accounts
  ADD COLUMN IF NOT EXISTS last_redeem_at timestamp with time zone;

-- ---------------------------------------------------------------------------
-- 4. v2_reserve_loyalty_points
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.v2_reserve_loyalty_points(
  p_account_id        uuid,
  p_user_id           uuid,
  p_points            integer,
  p_stripe_session_id text,         -- used as idempotency key suffix
  p_points_per_dollar numeric DEFAULT 100
)
RETURNS TABLE(
  reserved_points integer,
  reserved_cents  integer,
  new_balance     integer,
  was_duplicate   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account   loyalty_accounts%ROWTYPE;
  v_new_bal   integer;
  v_cents     integer;
  v_inserted  integer;
  v_idem_key  text;
BEGIN
  -- ── Input validation ──────────────────────────────────────────────────────
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'reserve amount must be positive, got %', p_points
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_stripe_session_id IS NULL OR trim(p_stripe_session_id) = '' THEN
    RAISE EXCEPTION 'stripe_session_id is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_points_per_dollar <= 0 THEN
    RAISE EXCEPTION 'points_per_dollar must be positive, got %', p_points_per_dollar
      USING ERRCODE = 'check_violation';
  END IF;

  v_idem_key := 'reserve:' || p_stripe_session_id;

  -- ── Idempotency check ─────────────────────────────────────────────────────
  -- If this exact session key was already reserved, return current state.
  -- This handles retried requests from the same checkout attempt.
  IF EXISTS (
    SELECT 1 FROM loyalty_ledger WHERE idempotency_key = v_idem_key
  ) THEN
    SELECT balance INTO v_new_bal FROM loyalty_accounts WHERE id = p_account_id;
    v_cents := floor(p_points::numeric / p_points_per_dollar * 100)::integer;
    RETURN QUERY SELECT p_points, v_cents, COALESCE(v_new_bal, 0), true;
    RETURN;
  END IF;

  -- ── Lock account row ──────────────────────────────────────────────────────
  -- FOR UPDATE prevents concurrent redemptions from reading stale balance.
  -- Two simultaneous checkouts for the same account queue here; the second
  -- sees the balance AFTER the first committed.
  SELECT * INTO v_account
  FROM loyalty_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty account not found: %', p_account_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Ownership check ───────────────────────────────────────────────────────
  -- Server-side; the edge function also checks this, but defense in depth.
  IF v_account.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Account % does not belong to user %', p_account_id, p_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Balance check ─────────────────────────────────────────────────────────
  IF v_account.balance < p_points THEN
    RAISE EXCEPTION 'Insufficient loyalty balance: account has %, redemption requires %',
      v_account.balance, p_points
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Compute values ────────────────────────────────────────────────────────
  v_new_bal := v_account.balance - p_points;
  v_cents   := floor(p_points::numeric / p_points_per_dollar * 100)::integer;

  -- ── Atomic ledger debit ───────────────────────────────────────────────────
  INSERT INTO loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    idempotency_key,
    tier_at_time,
    streak_at_time,
    metadata
  ) VALUES (
    p_account_id,
    -p_points,                     -- negative: debit
    v_new_bal,
    'checkout_reserve',            -- allowed by updated CHECK constraint
    'online_checkout',
    v_idem_key,
    v_account.tier,
    v_account.streak,
    jsonb_build_object(
      'stripe_session_id', p_stripe_session_id,
      'reserved_cents',    v_cents,
      'user_id',           p_user_id,
      'reserved_at',       now()
    )
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- ── Handle idempotency race ───────────────────────────────────────────────
  -- If two requests arrived simultaneously and both passed the EXISTS check,
  -- one will win the INSERT and the other will hit DO NOTHING.
  IF v_inserted = 0 THEN
    SELECT balance INTO v_new_bal FROM loyalty_accounts WHERE id = p_account_id;
    RETURN QUERY SELECT p_points, v_cents, COALESCE(v_new_bal, 0), true;
    RETURN;
  END IF;

  -- ── Sync account balance ──────────────────────────────────────────────────
  UPDATE loyalty_accounts
  SET
    balance       = v_new_bal,
    last_activity = now(),
    updated_at    = now()
  WHERE id = p_account_id;

  RETURN QUERY SELECT p_points, v_cents, v_new_bal, false;
END;
$$;

COMMENT ON FUNCTION public.v2_reserve_loyalty_points IS
  'Atomically reserves loyalty points at checkout start. '
  'FOR UPDATE prevents concurrent double-spend. '
  'Idempotent per stripe_session_id (pre-session key). '
  'Raises check_violation if balance insufficient. '
  'Pair with v2_release_loyalty_reserve on session expiry/cancellation.';

-- ---------------------------------------------------------------------------
-- 5. v2_release_loyalty_reserve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.v2_release_loyalty_reserve(
  p_stripe_session_id text,
  p_reason            text DEFAULT 'session_expired'
)
RETURNS TABLE(
  released        boolean,
  points_restored integer,
  new_balance     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserve     loyalty_ledger%ROWTYPE;
  v_account     loyalty_accounts%ROWTYPE;
  v_points      integer;
  v_new_bal     integer;
  v_release_key text;
BEGIN
  IF p_stripe_session_id IS NULL OR trim(p_stripe_session_id) = '' THEN
    RAISE EXCEPTION 'stripe_session_id is required'
      USING ERRCODE = 'check_violation';
  END IF;

  v_release_key := 'release:' || p_stripe_session_id;

  -- ── Idempotency: already released? ───────────────────────────────────────
  IF EXISTS (SELECT 1 FROM loyalty_ledger WHERE idempotency_key = v_release_key) THEN
    SELECT a.balance INTO v_new_bal
    FROM loyalty_accounts a
    JOIN loyalty_ledger l ON l.account_id = a.id
    WHERE l.idempotency_key = 'reserve:' || p_stripe_session_id
    LIMIT 1;

    RETURN QUERY SELECT false, 0, COALESCE(v_new_bal, 0);
    RETURN;
  END IF;

  -- ── Find the original reserve entry ───────────────────────────────────────
  SELECT * INTO v_reserve
  FROM loyalty_ledger
  WHERE idempotency_key = 'reserve:' || p_stripe_session_id
  LIMIT 1;

  IF NOT FOUND THEN
    -- No reserve exists — nothing to release (new user, loyalty not applied, etc.)
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  -- Only release if still in 'checkout_reserve' state.
  -- If already flipped to 'redeemed' by the completed handler, don't restore.
  IF v_reserve.entry_type = 'redeemed' THEN
    SELECT balance INTO v_new_bal FROM loyalty_accounts WHERE id = v_reserve.account_id;
    RETURN QUERY SELECT false, 0, COALESCE(v_new_bal, 0);
    RETURN;
  END IF;

  v_points := abs(v_reserve.amount);  -- restore as positive

  -- ── Lock account ──────────────────────────────────────────────────────────
  SELECT * INTO v_account
  FROM loyalty_accounts
  WHERE id = v_reserve.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  v_new_bal := v_account.balance + v_points;

  -- ── Compensating credit ledger entry ──────────────────────────────────────
  INSERT INTO loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    idempotency_key,
    tier_at_time,
    streak_at_time,
    metadata
  ) VALUES (
    v_reserve.account_id,
    v_points,                          -- positive: credit
    v_new_bal,
    'checkout_release',                -- allowed by updated CHECK constraint
    'system',
    v_release_key,
    v_account.tier,
    v_account.streak,
    jsonb_build_object(
      'stripe_session_id',       p_stripe_session_id,
      'original_reserve_id',     v_reserve.id,
      'reason',                  p_reason,
      'released_at',             now()
    )
  );

  -- ── Restore account balance ───────────────────────────────────────────────
  UPDATE loyalty_accounts
  SET
    balance    = v_new_bal,
    updated_at = now()
  WHERE id = v_account.id;

  RETURN QUERY SELECT true, v_points, v_new_bal;
END;
$$;

COMMENT ON FUNCTION public.v2_release_loyalty_reserve IS
  'Restores loyalty points reserved by v2_reserve_loyalty_points. '
  'Called by webhook on checkout.session.expired and by the cron fallback. '
  'Idempotent: calling twice for the same session is a no-op. '
  'Skips release if the ledger entry was already flipped to ''redeemed''.';

-- ---------------------------------------------------------------------------
-- 6. Permissions — service_role only
--    Edge functions run as service_role. No other role should call these.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.v2_reserve_loyalty_points  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.v2_release_loyalty_reserve FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.v2_reserve_loyalty_points  TO service_role;
GRANT EXECUTE ON FUNCTION public.v2_release_loyalty_reserve TO service_role;
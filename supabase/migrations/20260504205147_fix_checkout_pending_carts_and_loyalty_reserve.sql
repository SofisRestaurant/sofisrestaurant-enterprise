-- ============================================================================
-- Migration: fix_checkout_pending_carts_and_loyalty_reserve
--
-- Fixes three compounding runtime failures blocking authenticated checkout:
--
--   A. pending_carts 403
--      authenticated has SELECT only; no INSERT/UPDATE grants; no write policies.
--      An ON CONFLICT upsert requires both INSERT + UPDATE grants and matching
--      RLS policies for both operations.
--
--   B. loyalty_accounts_balance_check (pgCode 23514) constraint violation
--      trg_loyalty_ledger_sync_balance does a full SUM recompute on every
--      loyalty_ledger INSERT. v2_reserve_loyalty_points ALSO does an explicit
--      UPDATE loyalty_accounts SET balance = v_new_bal after the trigger.
--      The function's UPDATE (runs last) overrides the trigger's recompute,
--      creating drift on every reserve cycle. Confirmed: 4/4 accounts drifted,
--      max 15,062 pts above true ledger sum. On reserve, the trigger fires
--      first and computes SUM(ledger) - p_points which goes negative (drift),
--      violating the constraint before the function's own balance guard runs.
--      Fix: reconcile balances → change trigger to incremental → remove
--      balance assignment from the reserve function's final UPDATE.
--
--   C. create-checkout 422 — cascade of A and B; resolves with them.
--
-- Scope: permissions, one trigger function, one RPC function, one data fix.
-- No RLS disabling, no FORCE RLS changes, no business logic changes.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION A  ·  pending_carts write access
-- ════════════════════════════════════════════════════════════════════════════

-- A1: Table-level grants
--     Upsert (INSERT … ON CONFLICT … DO UPDATE) requires both verbs.
GRANT INSERT, UPDATE ON public.pending_carts TO authenticated;

-- A2: INSERT policy
--     User may only create a cart owned by themselves.
CREATE POLICY pending_carts_insert
  ON public.pending_carts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- A3: UPDATE policy
--     User may only update their own cart and may not re-assign ownership.
CREATE POLICY pending_carts_update
  ON public.pending_carts
  FOR UPDATE
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION B  ·  loyalty reserve constraint + balance drift
-- ════════════════════════════════════════════════════════════════════════════

-- B1: Pre-flight safety check
--     Abort if any account's true ledger sum is already negative.
--     That would indicate corrupted ledger data requiring manual review
--     before reconciliation can safely proceed.
DO $$
DECLARE
  v_neg_count integer;
BEGIN
  SELECT COUNT(*) INTO v_neg_count
  FROM   public.loyalty_accounts la
  WHERE  COALESCE(
           (SELECT SUM(amount) FROM public.loyalty_ledger
            WHERE  account_id = la.id),
           0
         ) < 0;

  IF v_neg_count > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % loyalty account(s) have a negative true ledger sum. '
      'Inspect loyalty_ledger for those accounts before re-running.',
      v_neg_count;
  END IF;
END;
$$;

-- B2: Reconcile stored balance → true ledger sum
--
-- Sets loyalty_accounts.balance to SUM(loyalty_ledger.amount) for every
-- account whose stored balance has drifted from its ledger sum.
-- Accounts with no ledger entries are zeroed.
-- This reconciliation must run BEFORE the trigger is changed to incremental
-- so that the incremental path starts from a correct baseline.

UPDATE public.loyalty_accounts la
SET    balance    = COALESCE(ls.total, 0),
       updated_at = now()
FROM (
  SELECT   account_id, SUM(amount)::int AS total
  FROM     public.loyalty_ledger
  GROUP BY account_id
) ls
WHERE la.id       = ls.account_id
  AND la.balance IS DISTINCT FROM COALESCE(ls.total, 0);

-- Zero accounts that have no ledger history but a non-zero stored balance.
UPDATE public.loyalty_accounts
SET    balance    = 0,
       updated_at = now()
WHERE  id NOT IN (SELECT DISTINCT account_id FROM public.loyalty_ledger)
  AND  balance <> 0;

-- B3: Change trigger function to incremental balance update
--
-- Previous implementation: SET balance = (SELECT SUM(amount) FROM loyalty_ledger …)
-- Problem: fires BEFORE the function's explicit UPDATE, using a freshly-inserted
-- negative entry. If stored_balance > SUM(ledger) (drift), the recomputed value
-- goes negative and violates balance >= 0.
--
-- New implementation: SET balance = balance + NEW.amount
-- Safe because:
--   (a) After B2, balance = SUM(ledger) for all accounts (no drift).
--   (b) The function guards: IF v_account.balance < p_points THEN RAISE,
--       so balance - p_points >= 0 is always true when the trigger fires.
--   (c) Removes two correlated sub-SELECTs on loyalty_ledger per write.
--
-- lifetime_earned is maintained incrementally for positive entries only,
-- consistent with the previous SUM FILTER (WHERE amount > 0) logic.

CREATE OR REPLACE FUNCTION public.loyalty_ledger_sync_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.loyalty_accounts
  SET
    balance         = balance + NEW.amount,
    lifetime_earned = CASE
                        WHEN NEW.amount > 0
                        THEN lifetime_earned + NEW.amount
                        ELSE lifetime_earned
                      END,
    updated_at      = now()
  WHERE id = NEW.account_id;
  RETURN NEW;
END;
$$;

-- B4: Remove balance assignment from v2_reserve_loyalty_points
--
-- The explicit UPDATE loyalty_accounts SET balance = v_new_bal was the
-- direct cause of the drift: it overrode the trigger's recomputed value
-- with arithmetic based on the (potentially drifted) stored balance.
-- Over many reserve cycles this caused stored_balance to diverge upward
-- from SUM(loyalty_ledger.amount).
--
-- The function's final UPDATE is retained to stamp last_activity and
-- updated_at (metadata). Balance is now solely owned by the trigger.
--
-- The RETURN now reads the post-trigger balance from the DB instead of
-- returning v_new_bal (pre-trigger arithmetic), so the caller always
-- receives the authoritative balance value.
--
-- All other logic (guards, idempotency, rate limits, ledger INSERT) is
-- unchanged verbatim.

CREATE OR REPLACE FUNCTION public.v2_reserve_loyalty_points(
  p_account_id        uuid,
  p_user_id           uuid,
  p_points            integer,
  p_stripe_session_id text,
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
SET search_path = 'public'
AS $function$
DECLARE
  v_account              loyalty_accounts%ROWTYPE;
  v_new_bal              integer;
  v_cents                integer;
  v_inserted             integer;
  v_idem_key             text;
  c_max_points_per_order CONSTANT integer := 5000;
  c_max_points_per_day   CONSTANT integer := 10000;
  v_active_reserves      integer;
  v_daily_redeemed       integer;
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
  IF p_points > c_max_points_per_order THEN
    RAISE EXCEPTION 'Per-order redemption limit exceeded: requested %, max per order is %',
      p_points, c_max_points_per_order
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Idempotency check ─────────────────────────────────────────────────────
  v_idem_key := 'reserve:' || p_stripe_session_id;

  IF EXISTS (
    SELECT 1 FROM loyalty_ledger WHERE idempotency_key = v_idem_key
  ) THEN
    SELECT balance INTO v_new_bal FROM loyalty_accounts WHERE id = p_account_id;
    v_cents := floor(p_points::numeric / p_points_per_dollar * 100)::integer;
    RETURN QUERY SELECT p_points, v_cents, COALESCE(v_new_bal, 0), true;
    RETURN;
  END IF;

  -- ── Lock account and validate ownership + balance ─────────────────────────
  SELECT * INTO v_account
  FROM   loyalty_accounts
  WHERE  id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty account not found: %', p_account_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_account.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Account % does not belong to user %', p_account_id, p_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_account.balance < p_points THEN
    RAISE EXCEPTION 'Insufficient loyalty balance: account has %, redemption requires %',
      v_account.balance, p_points
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Cross-session reserve stack prevention ────────────────────────────────
  SELECT COALESCE(ABS(SUM(amount)), 0)::integer
  INTO   v_active_reserves
  FROM   loyalty_ledger ll
  WHERE  ll.account_id      = p_account_id
    AND  ll.entry_type      = 'checkout_reserve'
    AND  ll.idempotency_key <> v_idem_key
    AND  NOT EXISTS (
      SELECT 1 FROM loyalty_ledger ll2
      WHERE  ll2.idempotency_key =
               replace(ll.idempotency_key, 'reserve:', 'release:')
    );

  IF v_active_reserves > 0 THEN
    RAISE EXCEPTION
      'Active loyalty reserve exists (% pts). Complete or cancel the existing checkout before starting a new one.',
      v_active_reserves
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Daily redemption rate limit ───────────────────────────────────────────
  SELECT COALESCE(ABS(SUM(amount)), 0)::integer
  INTO   v_daily_redeemed
  FROM   loyalty_ledger
  WHERE  account_id = p_account_id
    AND  entry_type IN ('redeemed', 'checkout_reserve')
    AND  created_at >= now() - interval '24 hours'
    AND  NOT EXISTS (
      SELECT 1 FROM loyalty_ledger ll2
      WHERE  ll2.idempotency_key =
               replace(loyalty_ledger.idempotency_key, 'reserve:', 'release:')
    );

  IF v_daily_redeemed + p_points > c_max_points_per_day THEN
    RAISE EXCEPTION
      'Daily redemption limit exceeded: % pts used today, % pts requested, daily max is %',
      v_daily_redeemed, p_points, c_max_points_per_day
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Compute amounts ───────────────────────────────────────────────────────
  v_cents   := floor(p_points::numeric / p_points_per_dollar * 100)::integer;
  -- v_new_bal is used as the denormalized balance_after snapshot in the ledger
  -- entry. The trigger owns the actual balance update on loyalty_accounts.
  v_new_bal := v_account.balance - p_points;

  -- ── Write ledger entry (trigger handles balance update) ───────────────────
  INSERT INTO loyalty_ledger (
    account_id, amount, balance_after, entry_type, source,
    idempotency_key, tier_at_time, streak_at_time, metadata
  ) VALUES (
    p_account_id, -p_points, v_new_bal, 'checkout_reserve', 'online_checkout',
    v_idem_key, v_account.tier, v_account.streak,
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

  IF v_inserted = 0 THEN
    -- Concurrent idempotency collision — return current state.
    SELECT balance INTO v_new_bal FROM loyalty_accounts WHERE id = p_account_id;
    RETURN QUERY SELECT p_points, v_cents, COALESCE(v_new_bal, 0), true;
    RETURN;
  END IF;

  -- ── Stamp activity metadata (balance owned by trigger) ───────────────────
  -- REMOVED: SET balance = v_new_bal  ← was causing drift on every reserve cycle
  UPDATE public.loyalty_accounts
  SET    last_activity = CURRENT_DATE,
         updated_at    = now()
  WHERE  id = p_account_id;

  -- Read the post-trigger balance — authoritative value set by
  -- trg_loyalty_ledger_sync_balance during the ledger INSERT above.
  SELECT balance INTO v_new_bal FROM public.loyalty_accounts WHERE id = p_account_id;

  RETURN QUERY SELECT p_points, v_cents, COALESCE(v_new_bal, 0), false;
END;
$function$;
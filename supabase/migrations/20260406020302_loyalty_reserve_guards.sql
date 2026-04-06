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
SET search_path = public
AS $$
DECLARE
  v_account          loyalty_accounts%ROWTYPE;
  v_new_bal          integer;
  v_cents            integer;
  v_inserted         integer;
  v_idem_key         text;
  c_max_points_per_order  CONSTANT integer := 5000;
  c_max_points_per_day    CONSTANT integer := 10000;
  v_active_reserves  integer;
  v_daily_redeemed   integer;
BEGIN
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
    RAISE EXCEPTION
      'Per-order redemption limit exceeded: requested %, max per order is %',
      p_points, c_max_points_per_order
      USING ERRCODE = 'check_violation';
  END IF;

  v_idem_key := 'reserve:' || p_stripe_session_id;

  IF EXISTS (
    SELECT 1 FROM loyalty_ledger WHERE idempotency_key = v_idem_key
  ) THEN
    SELECT balance INTO v_new_bal FROM loyalty_accounts WHERE id = p_account_id;
    v_cents := floor(p_points::numeric / p_points_per_dollar * 100)::integer;
    RETURN QUERY SELECT p_points, v_cents, COALESCE(v_new_bal, 0), true;
    RETURN;
  END IF;

  SELECT * INTO v_account
  FROM loyalty_accounts
  WHERE id = p_account_id
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
    RAISE EXCEPTION
      'Insufficient loyalty balance: account has %, redemption requires %',
      v_account.balance, p_points
      USING ERRCODE = 'check_violation';
  END IF;

SELECT COALESCE(ABS(SUM(amount)), 0)::integer
  INTO v_active_reserves
  FROM loyalty_ledger
  WHERE account_id    = p_account_id
    AND entry_type    = 'checkout_reserve'
    AND idempotency_key <> v_idem_key
    AND NOT EXISTS (
      SELECT 1 FROM loyalty_ledger ll2
      WHERE ll2.idempotency_key = replace(loyalty_ledger.idempotency_key, 'reserve:', 'release:')
    )
    AND NOT EXISTS (
      SELECT 1 FROM loyalty_ledger ll3
      WHERE ll3.idempotency_key = replace(loyalty_ledger.idempotency_key, 'reserve:', 'redeemed:')
        OR ll3.entry_type = 'redeemed'
        AND ll3.idempotency_key = loyalty_ledger.idempotency_key
    );

  IF v_active_reserves > 0 THEN
    RAISE EXCEPTION
      'Active loyalty reserve exists (% pts). Complete or cancel the existing checkout before starting a new one.',
      v_active_reserves
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(ABS(SUM(amount)), 0)::integer
  INTO v_daily_redeemed
  FROM loyalty_ledger
  WHERE account_id = p_account_id
    AND entry_type IN ('redeemed', 'checkout_reserve')
    AND created_at >= now() - interval '24 hours';

  IF v_daily_redeemed + p_points > c_max_points_per_day THEN
    RAISE EXCEPTION
      'Daily redemption limit exceeded: % pts used today, % pts requested, daily max is %',
      v_daily_redeemed, p_points, c_max_points_per_day
      USING ERRCODE = 'check_violation';
  END IF;

  v_new_bal := v_account.balance - p_points;
  v_cents   := floor(p_points::numeric / p_points_per_dollar * 100)::integer;

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
    -p_points,
    v_new_bal,
    'checkout_reserve',
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

  IF v_inserted = 0 THEN
    SELECT balance INTO v_new_bal FROM loyalty_accounts WHERE id = p_account_id;
    RETURN QUERY SELECT p_points, v_cents, COALESCE(v_new_bal, 0), true;
    RETURN;
  END IF;

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
  'Guards: per-order cap (5000 pts), daily cap (10000 pts/24h), '
  'cross-session stack prevention (one active reserve per account). '
  'FOR UPDATE prevents concurrent double-spend. '
  'Idempotent per stripe_session_id. '
  'Raises check_violation if any guard fails. '
  'Pair with v2_release_loyalty_reserve on session expiry/cancellation.';
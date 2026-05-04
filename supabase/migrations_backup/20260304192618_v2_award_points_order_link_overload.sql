-- REPLAY-SAFETY: Drop any stale overload with different return type
DROP FUNCTION IF EXISTS public.v2_award_points(uuid, uuid, integer, text, uuid);

CREATE OR REPLACE FUNCTION v2_award_points(
  p_account_id      uuid,     -- loyalty_accounts.id
  p_admin_id        uuid,     -- user_id of the customer (acting as "admin" for audit)
  p_amount_cents    integer,  -- order total in cents (1 pt per $1)
  p_idempotency_key text,     -- format: 'finalize-backfill:<order_id>'
  p_reference_id    uuid      -- order UUID for traceability
)
RETURNS TABLE(
  new_balance   integer,
  new_lifetime  integer,
  new_tier      text,
  tier_changed  boolean,
  was_duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_tier       text;
  v_old_streak     integer;
  v_old_balance    integer;
  v_old_lifetime   integer;
  v_new_balance    integer;
  v_new_lifetime   integer;
  v_new_tier       text;
  v_points         integer;
  v_rows_inserted  integer;
BEGIN
  -- Derive points: 1 pt per $1 (floor division, minimum 0)
  v_points := GREATEST(0, FLOOR(p_amount_cents::numeric / 100)::integer);

  -- ── Lock account row ──────────────────────────────────────────────────────
  SELECT tier, streak
  INTO v_old_tier, v_old_streak
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

  v_new_balance  := v_old_balance  + v_points;
  v_new_lifetime := v_old_lifetime + v_points;
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
    reference_id,
    tier_at_time,
    streak_at_time,
    metadata
  ) VALUES (
    p_account_id,
    v_points,
    v_new_balance,
    'earn',
    'order',
    p_admin_id,
    p_idempotency_key,
    p_reference_id,
    v_old_tier,        -- tier at time of order
    v_old_streak,      -- streak at time of order (read from account)
    jsonb_build_object(
      'amount_cents', p_amount_cents,
      'order_id',     p_reference_id
    )
  )
  ON CONFLICT (idempotency_key)
    WHERE idempotency_key IS NOT NULL
    DO NOTHING;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  -- ── Handle duplicate (idempotent no-op) ──────────────────────────────────
  IF v_rows_inserted = 0 THEN
    SELECT
      COALESCE(SUM(amount), 0)::integer,
      COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::integer
    INTO v_new_balance, v_new_lifetime
    FROM loyalty_ledger
    WHERE account_id = p_account_id;

    v_new_tier := v2_resolve_tier(v_new_lifetime);

    RETURN QUERY SELECT
      v_new_balance, v_new_lifetime, v_new_tier,
      false,
      true;
    RETURN;
  END IF;

  -- ── Update tier on account (streak managed separately by streak logic) ─────
  UPDATE loyalty_accounts
  SET
    tier          = v_new_tier,
    last_activity = CURRENT_DATE
  WHERE id = p_account_id;

  RETURN QUERY SELECT
    v_new_balance,
    v_new_lifetime,
    v_new_tier,
    (v_new_tier <> v_old_tier),
    false;
END;
$$;

COMMENT ON FUNCTION v2_award_points(uuid, uuid, integer, text, uuid) IS
  'Order finalization overload of v2_award_points. '
  'Derives points from amount_cents (1pt/$1), reads current streak and tier '
  'from loyalty_accounts, writes them to loyalty_ledger.streak_at_time and '
  'tier_at_time. Idempotent via idempotency_key. '
  'Called by finalize-order Edge Function.';
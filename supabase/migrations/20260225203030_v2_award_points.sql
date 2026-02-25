CREATE OR REPLACE FUNCTION v2_award_points(
  p_user_id uuid,
  p_amount integer,
  p_admin_id uuid,
  p_reference_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE(
  new_balance integer,
  new_lifetime integer,
  new_tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account loyalty_accounts%ROWTYPE;
  v_new_balance integer;
  v_new_lifetime integer;
  v_new_tier text;
BEGIN

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Award amount must be positive';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM loyalty_ledger
      WHERE idempotency_key = p_idempotency_key
    ) THEN
      RETURN QUERY
      SELECT balance, lifetime_earned, tier
      FROM loyalty_accounts
      WHERE user_id = p_user_id;
      RETURN;
    END IF;
  END IF;

  -- Lock account row
  SELECT *
  INTO v_account
  FROM loyalty_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty account not found';
  END IF;

  v_new_balance := v_account.balance + p_amount;
  v_new_lifetime := v_account.lifetime_earned + p_amount;

  -- Tier logic
  v_new_tier :=
    CASE
      WHEN v_new_lifetime >= 5000 THEN 'platinum'
      WHEN v_new_lifetime >= 2000 THEN 'gold'
      WHEN v_new_lifetime >= 500 THEN 'silver'
      ELSE 'bronze'
    END;

  -- Update account
  UPDATE loyalty_accounts
  SET
    balance = v_new_balance,
    lifetime_earned = v_new_lifetime,
    tier = v_new_tier,
    last_activity = now(),
    updated_at = now()
  WHERE id = v_account.id;

  -- Insert ledger entry
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
  ) VALUES (
    v_account.id,
    p_amount,
    v_new_balance,
    'earn',
    'admin',
    p_reference_id,
    p_admin_id,
    p_idempotency_key,
    v_new_tier,
    v_account.streak,
    jsonb_build_object(
      'awarded_at', now()
    )
  );

  RETURN QUERY
  SELECT v_new_balance, v_new_lifetime, v_new_tier;

END;
$$;
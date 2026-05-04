CREATE OR REPLACE FUNCTION award_loyalty_points_atomic(
  p_user_id      uuid,
  p_points       integer,
  p_admin_id     uuid,
  p_base_points  integer,
  p_tier         text,
  p_tier_mult    numeric,
  p_streak       integer,
  p_streak_mult  numeric,
  p_amount_cents integer,
  p_order_id     uuid DEFAULT NULL
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
BEGIN
  RAISE EXCEPTION
    'award_loyalty_points_atomic is deprecated. Use v2_award_points().'
    USING ERRCODE = 'feature_not_supported';
END;
$$;
CREATE OR REPLACE FUNCTION redeem_loyalty_points_atomic(
  p_user_id  uuid,
  p_points   integer,
  p_admin_id uuid,
  p_mode     text DEFAULT 'dine_in'
)
RETURNS TABLE(new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION
    'redeem_loyalty_points_atomic is deprecated. Use v2_redeem_points().'
    USING ERRCODE = 'feature_not_supported';
END;
$$;
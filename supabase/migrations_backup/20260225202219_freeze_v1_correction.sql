CREATE OR REPLACE FUNCTION issue_loyalty_correction(
  p_user_id  uuid,
  p_points   integer,
  p_admin_id uuid,
  p_reason   text
)
RETURNS TABLE(new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION
    'issue_loyalty_correction is deprecated. Use v2_issue_correction().'
    USING ERRCODE = 'feature_not_supported';
END;
$$;
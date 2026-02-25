-- Remove public execution
REVOKE ALL ON FUNCTION v2_award_points FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_redeem_points FROM PUBLIC;

-- Allow only service role (Edge Functions)
GRANT EXECUTE ON FUNCTION v2_award_points TO service_role;
GRANT EXECUTE ON FUNCTION v2_redeem_points TO service_role;
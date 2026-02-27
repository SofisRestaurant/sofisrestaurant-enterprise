-- =============================================================================
-- LOYALTY V2 — PERMISSIONS
-- =============================================================================

-- Remove public access
REVOKE ALL ON FUNCTION public.v2_award_points(
  uuid, uuid, integer, integer, text, numeric, integer, numeric, integer, text
) FROM authenticated;

REVOKE ALL ON FUNCTION public.v2_redeem_points(
  uuid, uuid, integer, text, text
) FROM authenticated;

REVOKE ALL ON FUNCTION public.v2_issue_correction(
  uuid, uuid, integer, text
) FROM authenticated;


-- Allow service role only
GRANT EXECUTE ON FUNCTION public.v2_award_points(
  uuid, uuid, integer, integer, text, numeric, integer, numeric, integer, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.v2_redeem_points(
  uuid, uuid, integer, text, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.v2_issue_correction(
  uuid, uuid, integer, text
) TO service_role;
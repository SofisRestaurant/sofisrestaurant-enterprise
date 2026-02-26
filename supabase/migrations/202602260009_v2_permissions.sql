REVOKE ALL ON FUNCTION public.v2_award_points(
  uuid, integer, uuid, uuid, text
) FROM authenticated;

REVOKE ALL ON FUNCTION public.v2_redeem_points(
  uuid, integer, uuid, uuid, text
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.v2_award_points(
  uuid, integer, uuid, uuid, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.v2_redeem_points(
  uuid, integer, uuid, uuid, text
) TO service_role;
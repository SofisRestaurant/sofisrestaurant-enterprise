-- =============================================================================
-- V2 Permissions (Explicit Signatures)
-- =============================================================================

-- Remove public execution

REVOKE ALL ON FUNCTION public.v2_award_points(
  uuid,
  integer,
  uuid,
  uuid,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.v2_redeem_points(
  uuid,
  uuid,
  integer,
  text,
  uuid
) FROM PUBLIC;

-- Allow only service role (Edge Functions)

GRANT EXECUTE ON FUNCTION public.v2_award_points(
  uuid,
  integer,
  uuid,
  uuid,
  text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.v2_redeem_points(
  uuid,
  uuid,
  integer,
  text,
  uuid
) TO service_role;

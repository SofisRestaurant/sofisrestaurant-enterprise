-- ============================================================================
-- Fix: loyalty checkout "Unable to apply loyalty points"
--
-- Root cause (two problems compounding):
--
--   1. EXECUTE not granted to authenticated
--      v2_redeem_points was callable only by postgres and service_role.
--      PostgREST checks function-level privileges before the body runs,
--      so every client call with a JWT was rejected with
--      "permission denied for function v2_redeem_points" — never reaching
--      the INSERT at all. The INSERT path was already safe: the function is
--      SECURITY DEFINER owned by postgres (rolbypassrls=true), so the ledger
--      write bypasses RLS entirely once the function body executes.
--
--   2. Dead PERMISSIVE INSERT policy on loyalty_ledger
--      allow_loyalty_redeem_insert (PERMISSIVE, authenticated, WITH CHECK=true)
--      was unconditionally overridden by loyalty_ledger_block_insert
--      (RESTRICTIVE, authenticated, WITH CHECK=false). A RESTRICTIVE policy
--      with a constant false condition is a hard block that no PERMISSIVE
--      policy can override. The permissive policy provided zero access while
--      making the policy set harder to audit. Removing it does not change
--      effective behaviour — authenticated is still blocked from direct inserts.
--
-- Changes (minimal, no business logic or RLS structure altered):
--   1. GRANT EXECUTE on v2_redeem_points to authenticated
--   2. DROP dead allow_loyalty_redeem_insert policy
-- ============================================================================

-- 1. Unlock the call gate.
--    The INSERT inside the function runs as postgres (rolbypassrls=true)
--    and is not subject to RLS. This grant does not open table-level access.
GRANT EXECUTE ON FUNCTION public.v2_redeem_points(
  p_account_id      uuid,
  p_amount          integer,
  p_admin_id        uuid,
  p_reference_id    uuid,
  p_idempotency_key text
) TO authenticated;

-- 2. Remove the dead PERMISSIVE INSERT policy.
--    IF NOT EXISTS variant of DROP is not standard SQL; use IF EXISTS instead.
--    Safe to run on a DB where it was already dropped.
DROP POLICY IF EXISTS "allow_loyalty_redeem_insert" ON public.loyalty_ledger;
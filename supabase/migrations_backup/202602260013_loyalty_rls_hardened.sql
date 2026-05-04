-- =============================================================================
-- 202602260013_loyalty_rls_hardened.sql
-- LOYALTY V2 — RLS HARDENING
-- =============================================================================
-- Idempotent. Safe to run multiple times.
-- Grounded in confirmed live schema:
--
--   loyalty_accounts columns:
--     id, user_id, balance, lifetime_earned, tier, streak,
--     last_activity (date), last_award_at, last_redeem_at,
--     created_at, updated_at, status
--
--   loyalty_ledger columns:
--     id, account_id, amount, balance_after, entry_type, source,
--     reference_id, admin_id, tier_at_time, streak_at_time,
--     metadata, row_hash, prev_hash, idempotency_key, created_at
--
-- RLS already enabled on both tables (confirmed: relrowsecurity = true).
-- RPCs already SECURITY DEFINER (confirmed: prosecdef = true).
--
-- This migration:
--   1. Drops and recreates all loyalty_accounts + loyalty_ledger policies
--      cleanly (idempotent via DROP IF EXISTS)
--   2. Locks both v2_award_points overloads and v2_redeem_points to
--      service_role only via explicit per-signature grants
--   3. Verifies RLS is still enabled after all changes
-- =============================================================================

-- ── LOYALTY_ACCOUNTS ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "loyalty_accounts: users read own"               ON public.loyalty_accounts;
DROP POLICY IF EXISTS "loyalty_accounts: deny authenticated insert"    ON public.loyalty_accounts;
DROP POLICY IF EXISTS "loyalty_accounts: deny authenticated update"    ON public.loyalty_accounts;
DROP POLICY IF EXISTS "loyalty_accounts: deny authenticated delete"    ON public.loyalty_accounts;
DROP POLICY IF EXISTS "loyalty_accounts: service role full access"     ON public.loyalty_accounts;

ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_accounts: users read own"
  ON public.loyalty_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "loyalty_accounts: deny authenticated insert"
  ON public.loyalty_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "loyalty_accounts: deny authenticated update"
  ON public.loyalty_accounts
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "loyalty_accounts: deny authenticated delete"
  ON public.loyalty_accounts
  FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "loyalty_accounts: service role full access"
  ON public.loyalty_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── LOYALTY_LEDGER ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "loyalty_ledger: users read own"                 ON public.loyalty_ledger;
DROP POLICY IF EXISTS "loyalty_ledger: deny all authenticated writes"  ON public.loyalty_ledger;
DROP POLICY IF EXISTS "loyalty_ledger: deny authenticated update"      ON public.loyalty_ledger;
DROP POLICY IF EXISTS "loyalty_ledger: deny authenticated delete"      ON public.loyalty_ledger;
DROP POLICY IF EXISTS "loyalty_ledger: service role full access"       ON public.loyalty_ledger;

ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_ledger: users read own"
  ON public.loyalty_ledger
  FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT id
      FROM public.loyalty_accounts
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "loyalty_ledger: deny all authenticated writes"
  ON public.loyalty_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "loyalty_ledger: deny authenticated update"
  ON public.loyalty_ledger
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "loyalty_ledger: deny authenticated delete"
  ON public.loyalty_ledger
  FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "loyalty_ledger: service role full access"
  ON public.loyalty_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── VERIFY RLS IS ACTIVE ──────────────────────────────────────────────────────

DO $$
DECLARE
  v_accounts_rls boolean;
  v_ledger_rls   boolean;
BEGIN
  SELECT relrowsecurity INTO v_accounts_rls
  FROM pg_class
  WHERE relname = 'loyalty_accounts'
    AND relnamespace = 'public'::regnamespace;

  SELECT relrowsecurity INTO v_ledger_rls
  FROM pg_class
  WHERE relname = 'loyalty_ledger'
    AND relnamespace = 'public'::regnamespace;

  IF NOT v_accounts_rls THEN
    RAISE EXCEPTION 'CRITICAL: RLS not enabled on loyalty_accounts';
  END IF;
  IF NOT v_ledger_rls THEN
    RAISE EXCEPTION 'CRITICAL: RLS not enabled on loyalty_ledger';
  END IF;

  RAISE NOTICE 'RLS verification passed: loyalty_accounts=%, loyalty_ledger=%',
    v_accounts_rls, v_ledger_rls;
END $$;

-- ── VERIFY RPCS ARE SECURITY DEFINER ─────────────────────────────────────────

DO $$
DECLARE
  v_redeem_secdef boolean;
  v_award_secdef  boolean;
BEGIN
  SELECT prosecdef INTO v_redeem_secdef
  FROM pg_proc
  WHERE proname = 'v2_redeem_points'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  SELECT prosecdef INTO v_award_secdef
  FROM pg_proc
  WHERE proname = 'v2_award_points'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF NOT COALESCE(v_redeem_secdef, false) THEN
    RAISE WARNING 'v2_redeem_points is NOT security definer — authenticated users may be blocked';
  END IF;
  IF NOT COALESCE(v_award_secdef, false) THEN
    RAISE WARNING 'v2_award_points is NOT security definer — authenticated users may be blocked';
  END IF;

  IF COALESCE(v_redeem_secdef, false) AND COALESCE(v_award_secdef, false) THEN
    RAISE NOTICE 'Security definer verification passed: both RPCs are SECURITY DEFINER';
  END IF;
END $$;

-- ── GRANT EXECUTE ON RPCS TO SERVICE ROLE ONLY ───────────────────────────────
-- Explicit per-signature grants. Generic "FUNCTION public.v2_award_points"
-- is intentionally NOT used — it is ambiguous when multiple overloads exist
-- and Postgres will error on replay if only one overload is present.

-- v2_redeem_points
REVOKE EXECUTE ON FUNCTION public.v2_redeem_points(uuid, uuid, integer, text, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.v2_redeem_points(uuid, uuid, integer, text, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.v2_redeem_points(uuid, uuid, integer, text, uuid)
  TO service_role, postgres;

-- v2_award_points — 10-param QR scan overload (award-loyalty-qr Edge Function)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'v2_award_points'
      AND pronamespace = 'public'::regnamespace
      AND pronargs = 10
  ) THEN
    EXECUTE '
      REVOKE EXECUTE ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, integer, text, numeric, integer, numeric, integer, text
      ) FROM PUBLIC';
    EXECUTE '
      REVOKE EXECUTE ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, integer, text, numeric, integer, numeric, integer, text
      ) FROM authenticated';
    EXECUTE '
      GRANT EXECUTE ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, integer, text, numeric, integer, numeric, integer, text
      ) TO service_role, postgres';
    RAISE NOTICE 'v2_award_points (10-param QR scan) execute grants applied';
  ELSE
    RAISE NOTICE 'v2_award_points (10-param) not found — skipping';
  END IF;
END $$;

-- v2_award_points — 5-param order finalization overload (finalize-order Edge Function)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'v2_award_points'
      AND pronamespace = 'public'::regnamespace
      AND pronargs = 5
  ) THEN
    EXECUTE '
      REVOKE EXECUTE ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, text, uuid
      ) FROM PUBLIC';
    EXECUTE '
      REVOKE EXECUTE ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, text, uuid
      ) FROM authenticated';
    EXECUTE '
      GRANT EXECUTE ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, text, uuid
      ) TO service_role, postgres';
    RAISE NOTICE 'v2_award_points (5-param order finalization) execute grants applied';
  ELSE
    RAISE NOTICE 'v2_award_points (5-param) not found — skipping';
  END IF;
END $$;
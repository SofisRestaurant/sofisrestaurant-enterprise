-- =============================================================================
-- 202602260009_v2_permissions.sql
-- LOYALTY V2 — PERMISSIONS (REPLAY-SAFE)
-- =============================================================================
-- All REVOKE / GRANT calls are wrapped in pg_proc existence checks so this
-- migration never hard-fails during shadow DB replay, regardless of the order
-- in which overloads are created or dropped by surrounding migrations.
--
-- Canonical overloads addressed:
--   v2_award_points  10-param  QR scan        (award-loyalty-qr Edge Function)
--   v2_award_points   5-param  Order finalize (finalize-order Edge Function)
--   v2_redeem_points  5-param  Redemption     (redeem-loyalty Edge Function)
--   v2_issue_correction 4-param Correction    (admin Edge Function)
--
-- Security intent (unchanged):
--   • REVOKE from PUBLIC + authenticated
--   • GRANT  to   service_role + postgres
-- =============================================================================


-- ── Helper: safe_revoke_grant ─────────────────────────────────────────────────
-- Called once per overload. Checks pg_proc by name + exact arg-type OID array
-- before issuing any DDL, so a missing overload is a NOTICE, not an error.
-- There is no reusable PL/pgSQL function here (that would itself require a
-- CREATE before REVOKE, defeating the purpose). Each block is explicit.


-- ── v2_award_points — 10-param QR scan overload ───────────────────────────────
--    (uuid, uuid, integer, integer, text, numeric, integer, numeric, integer, text)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname  = 'v2_award_points'
      AND p.pronargs = 10
  ) THEN
    EXECUTE '
      REVOKE ALL ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, integer, text, numeric, integer, numeric, integer, text
      ) FROM PUBLIC';
    EXECUTE '
      REVOKE ALL ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, integer, text, numeric, integer, numeric, integer, text
      ) FROM authenticated';
    EXECUTE '
      GRANT EXECUTE ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, integer, text, numeric, integer, numeric, integer, text
      ) TO service_role, postgres';
    RAISE NOTICE 'v2_award_points (10-param QR scan): permissions applied.';
  ELSE
    RAISE NOTICE 'v2_award_points (10-param QR scan): not found — skipping (will be applied when the function is created).';
  END IF;
END $$;


-- ── v2_award_points — 5-param order finalization overload ─────────────────────
--    (uuid, uuid, integer, text, uuid)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname  = 'v2_award_points'
      AND p.pronargs = 5
      -- Distinguish from any other 5-param overload by checking arg types.
      -- proargtypes is a space-separated oidvector; cast to text for a
      -- reliable prefix/suffix check without hard-coding volatile OIDs.
      AND p.proargtypes::text = (
        SELECT string_agg(oid::text, ' ' ORDER BY ord)
        FROM (VALUES
          (1, 'uuid'::regtype::oid),
          (2, 'uuid'::regtype::oid),
          (3, 'integer'::regtype::oid),
          (4, 'text'::regtype::oid),
          (5, 'uuid'::regtype::oid)
        ) AS t(ord, oid)
      )
  ) THEN
    EXECUTE '
      REVOKE ALL ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, text, uuid
      ) FROM PUBLIC';
    EXECUTE '
      REVOKE ALL ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, text, uuid
      ) FROM authenticated';
    EXECUTE '
      GRANT EXECUTE ON FUNCTION public.v2_award_points(
        uuid, uuid, integer, text, uuid
      ) TO service_role, postgres';
    RAISE NOTICE 'v2_award_points (5-param order finalization): permissions applied.';
  ELSE
    RAISE NOTICE 'v2_award_points (5-param order finalization): not found — skipping.';
  END IF;
END $$;


-- ── v2_redeem_points — 5-param redemption overload ────────────────────────────
--    (uuid, uuid, integer, text, text)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname  = 'v2_redeem_points'
      AND p.pronargs = 5
      AND p.proargtypes::text = (
        SELECT string_agg(oid::text, ' ' ORDER BY ord)
        FROM (VALUES
          (1, 'uuid'::regtype::oid),
          (2, 'uuid'::regtype::oid),
          (3, 'integer'::regtype::oid),
          (4, 'text'::regtype::oid),
          (5, 'text'::regtype::oid)
        ) AS t(ord, oid)
      )
  ) THEN
    EXECUTE '
      REVOKE ALL ON FUNCTION public.v2_redeem_points(
        uuid, uuid, integer, text, text
      ) FROM PUBLIC';
    EXECUTE '
      REVOKE ALL ON FUNCTION public.v2_redeem_points(
        uuid, uuid, integer, text, text
      ) FROM authenticated';
    EXECUTE '
      GRANT EXECUTE ON FUNCTION public.v2_redeem_points(
        uuid, uuid, integer, text, text
      ) TO service_role, postgres';
    RAISE NOTICE 'v2_redeem_points (5-param): permissions applied.';
  ELSE
    RAISE NOTICE 'v2_redeem_points (5-param): not found — skipping.';
  END IF;
END $$;


-- ── v2_issue_correction — 4-param correction overload ─────────────────────────
--    (uuid, uuid, integer, text)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname  = 'v2_issue_correction'
      AND p.pronargs = 4
      AND p.proargtypes::text = (
        SELECT string_agg(oid::text, ' ' ORDER BY ord)
        FROM (VALUES
          (1, 'uuid'::regtype::oid),
          (2, 'uuid'::regtype::oid),
          (3, 'integer'::regtype::oid),
          (4, 'text'::regtype::oid)
        ) AS t(ord, oid)
      )
  ) THEN
    EXECUTE '
      REVOKE ALL ON FUNCTION public.v2_issue_correction(
        uuid, uuid, integer, text
      ) FROM PUBLIC';
    EXECUTE '
      REVOKE ALL ON FUNCTION public.v2_issue_correction(
        uuid, uuid, integer, text
      ) FROM authenticated';
    EXECUTE '
      GRANT EXECUTE ON FUNCTION public.v2_issue_correction(
        uuid, uuid, integer, text
      ) TO service_role, postgres';
    RAISE NOTICE 'v2_issue_correction (4-param): permissions applied.';
  ELSE
    RAISE NOTICE 'v2_issue_correction (4-param): not found — skipping.';
  END IF;
END $$;
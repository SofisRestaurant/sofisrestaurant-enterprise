-- =============================================================================
-- Migration: fix_orders_identity_constraint_and_add_risk_fields
-- Path: supabase/migrations/20260420000001_fix_orders_identity_and_risk.sql
-- =============================================================================
-- Fixes issues found in the prior guest checkout migration:
--
--   ISSUE 1 — orders_identity_check is too strict.
--     The prior constraint required either customer_uid OR guest_email.
--     Guest orders in the webhook pipeline use guest_token as identity.
--     New rule: any one of customer_uid, guest_email, or guest_token suffices.
--
--   ISSUE 2 — pre-existing rows with no identity columns set.
--     19 rows from Feb 2026 (before the guest token system) have:
--       customer_uid = NULL, guest_email = NULL, guest_token = NULL
--     All have customer_email populated and source = NULL.
--     These are pre-identity-system orders placed during early testing.
--     BACKFILL: copy customer_email → guest_email for these rows so the
--     constraint can be applied without data loss. source is set to 'legacy'
--     to distinguish them from active auth/guest pipelines.
--
--   ISSUE 3 — risk columns missing.
--     Adds risk_score, risk_level, verification_status, verified_at.
--
--   ISSUE 4 — verified_at constraint was one-directional.
--     Added orders_verified_at_completeness for the reverse direction.
--
--   ISSUE 5 — verification_status DEFAULT NULL is a silent bypass.
--     Changed to DEFAULT 'not_required'.
--
--   ISSUE 6 — stripe_session_id unique index made explicit.
--   ISSUE 7 — guest_token non-unique index added.
--   ISSUE 8 — risk → verification DB-level coupling added.
--
-- SAFE TO RUN:
--   All DROP CONSTRAINT calls are conditional. ADD COLUMN uses IF NOT EXISTS.
--   The backfill uses WHERE to touch only the exact rows that need it.
-- =============================================================================

-- ─── 1. Backfill pre-identity-system rows ────────────────────────────────────
--
-- These rows predate the guest_token and customer_uid columns. They have
-- customer_email populated by Stripe, which we promote to guest_email so
-- the identity constraint can be satisfied. source is set to 'legacy' so
-- they are identifiable in queries and never confused with active pipelines.
--
-- The WHERE clause is precise: only rows that would violate the constraint
-- AND have a customer_email to backfill from. Rows with no email at all
-- (which do not appear in this dataset) are left untouched and would still
-- fail the constraint — that case does not exist in the current data.

UPDATE public.orders
SET
  guest_email = customer_email,
  source      = 'legacy'
WHERE customer_uid  IS NULL
  AND guest_email   IS NULL
  AND guest_token   IS NULL
  AND customer_email IS NOT NULL;

-- ─── 2. Replace orders_identity_check ────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_identity_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_identity_check;
  END IF;
END;
$$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_identity_check
  CHECK (
    customer_uid IS NOT NULL   -- authenticated user
    OR guest_email IS NOT NULL -- guest with captured email (+ legacy rows)
    OR guest_token IS NOT NULL -- guest with token (webhook pipeline)
  );

-- ─── 3. source column: add 'legacy' to the allowed values ────────────────────
--
-- The source column has a CHECK constraint limiting it to ('auth', 'guest').
-- The backfill sets source = 'legacy' for pre-identity rows, so we must
-- widen the constraint first. Drop and recreate conditionally.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_source_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_source_check;
  END IF;
  -- Also check for any inline CHECK on the source column under a different name
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_source_valid'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_source_valid;
  END IF;
END;
$$;

-- Re-add with 'legacy' included. If no source constraint existed before,
-- this is a net addition of a useful guard.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_valid
    CHECK (source IS NULL OR source IN ('auth', 'guest', 'legacy'));

-- ─── 4. Risk columns ─────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS risk_score          INTEGER     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS risk_level          TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verification_status TEXT        NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS verified_at         TIMESTAMPTZ DEFAULT NULL;

-- ─── 5. Risk and verification constraints ────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_risk_score_range'              AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_risk_score_range;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_risk_level_valid'               AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_risk_level_valid;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_verification_status_valid'      AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_verification_status_valid;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_verified_at_consistency'        AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_verified_at_consistency;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_verified_at_completeness'       AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_verified_at_completeness;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_risk_requires_verification'     AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_risk_requires_verification;
  END IF;
END;
$$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_risk_score_range
    CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_risk_level_valid
    CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high'));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_verification_status_valid
    CHECK (
      verification_status IN ('not_required', 'required', 'verified', 'failed')
    );

-- Direction 1: verified_at may only be set when status is 'verified'
ALTER TABLE public.orders
  ADD CONSTRAINT orders_verified_at_consistency
    CHECK (verified_at IS NULL OR verification_status = 'verified');

-- Direction 2: if status is 'verified', verified_at must be set
ALTER TABLE public.orders
  ADD CONSTRAINT orders_verified_at_completeness
    CHECK (verification_status <> 'verified' OR verified_at IS NOT NULL);

-- High-risk orders must have a verification gate status, not 'not_required'.
-- Safe because risk_level and verification_status are written in the same
-- atomic INSERT — no intermediate state triggers this constraint.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_risk_requires_verification
    CHECK (
      risk_level <> 'high'
      OR verification_status IN ('required', 'verified', 'failed')
    );

-- ─── 6. Indexes ───────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session_id
  ON public.orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Non-unique: a returning guest can place multiple orders across sessions
CREATE INDEX IF NOT EXISTS idx_orders_guest_token
  ON public.orders (guest_token)
  WHERE guest_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_risk_level
  ON public.orders (risk_level)
  WHERE risk_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_verification_status_required
  ON public.orders (verification_status)
  WHERE verification_status = 'required';

-- ─── 7. Comments ─────────────────────────────────────────────────────────────

COMMENT ON CONSTRAINT orders_identity_check ON public.orders IS
  'An order must have at least one identity signal: customer_uid (auth), '
  'guest_email (email-captured guest or legacy pre-token row), or guest_token.';

COMMENT ON CONSTRAINT orders_verified_at_consistency ON public.orders IS
  'verified_at may only be non-null when verification_status is ''verified''.';

COMMENT ON CONSTRAINT orders_verified_at_completeness ON public.orders IS
  'When verification_status is ''verified'', verified_at must be set. '
  'Bidirectional invariant with orders_verified_at_consistency.';

COMMENT ON CONSTRAINT orders_risk_requires_verification ON public.orders IS
  'A high-risk order must have a verification gate status, not ''not_required''. '
  'Safe because both columns are written atomically at order creation.';

COMMENT ON COLUMN public.orders.risk_score IS
  'Fraud risk score 0–100. NULL for pre-migration rows.';

COMMENT ON COLUMN public.orders.risk_level IS
  'Risk tier: low | medium | high. NULL for pre-migration rows.';

COMMENT ON COLUMN public.orders.verification_status IS
  'OTP pipeline state. NOT NULL, defaults to ''not_required''.';

COMMENT ON COLUMN public.orders.verified_at IS
  'Set when verification_status transitions to ''verified'' via verify-phone.';
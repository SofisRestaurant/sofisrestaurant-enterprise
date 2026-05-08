-- =============================================================================
-- Migration: harden OTP + challenge tables for idempotency and performance
-- File:      supabase/migrations/20260508000000_harden_otp_challenge_tables.sql
-- =============================================================================
--
-- CHANGES:
--
--   1. checkout_challenges: add partial unique index on (nonce) WHERE consumed_at IS NULL
--      Enforces that only one non-consumed row can exist per nonce at a time.
--      INSERT of a duplicate non-consumed nonce raises a unique violation, which
--      the application handles gracefully (token reconstruction).
--
--   2. checkout_challenges: add index on expires_at for TTL queries.
--      The idempotency SELECT filters on (nonce, consumed_at IS NULL, expires_at > now()).
--      Without an index on expires_at, this is a full table scan.
--
--   3. sms_verify_attempts: add index on (phone_hash, created_at DESC).
--      The rate-limit query filters on phone_hash + created_at range.
--      Without a composite index this is a full table scan on every OTP send.
--
--   4. checkout_risk_events: add index on (request_ip, created_at DESC)
--      and (guest_email_hash, created_at DESC) for velocity signal queries.
--
-- All changes are additive (CREATE INDEX IF NOT EXISTS / ADD CONSTRAINT IF NOT EXISTS).
-- Safe to run on a live database.
-- =============================================================================

-- ─── checkout_challenges ─────────────────────────────────────────────────────

-- Enforce single non-consumed row per nonce (prevents concurrent double-insert
-- from producing two live tokens for the same nonce).
CREATE UNIQUE INDEX IF NOT EXISTS checkout_challenges_nonce_unconsumed_unique
  ON checkout_challenges (nonce)
  WHERE consumed_at IS NULL;

-- Index for TTL expiry queries and idempotency SELECT.
CREATE INDEX IF NOT EXISTS checkout_challenges_expires_at_idx
  ON checkout_challenges (expires_at DESC);

-- ─── sms_verify_attempts ─────────────────────────────────────────────────────

-- Composite index for rate-limit window query:
-- WHERE phone_hash = $1 AND created_at >= $windowStart
CREATE INDEX IF NOT EXISTS sms_verify_attempts_rate_limit_idx
  ON sms_verify_attempts (phone_hash, created_at DESC);

-- ─── checkout_risk_events ────────────────────────────────────────────────────

-- Velocity signal: how many checkout attempts from this IP in the last 15 min.
CREATE INDEX IF NOT EXISTS checkout_risk_events_ip_velocity_idx
  ON checkout_risk_events (request_ip, created_at DESC)
  WHERE request_ip IS NOT NULL;

-- Velocity signal: how many checkout attempts from this guest email in last 15 min.
-- Uses hashed column if present; otherwise create on raw email if schema permits.
DO $$
BEGIN
  -- Only create if the column exists (schema may vary by deployment)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkout_risk_events' AND column_name = 'guest_email'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS checkout_risk_events_email_velocity_idx
      ON checkout_risk_events (guest_email, created_at DESC)
      WHERE guest_email IS NOT NULL';
  END IF;
END $$;

-- ─── Cleanup cron (optional) ──────────────────────────────────────────────────
--
-- Expired challenge tokens accumulate. Add a cron job to purge them.
-- Run in supabase/cron/ or schedule via pg_cron if available.
--
-- DELETE FROM checkout_challenges
-- WHERE expires_at < now() - interval '1 day';
--
-- DELETE FROM sms_verify_attempts
-- WHERE created_at < now() - interval '1 hour';
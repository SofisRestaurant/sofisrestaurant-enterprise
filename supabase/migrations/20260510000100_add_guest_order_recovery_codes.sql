-- =============================================================================
-- Migration: add_guest_order_recovery_codes
-- =============================================================================
-- Stores hashed OTPs for the guest order recovery (Find My Order) flow.
-- Raw contact values (phone/email) and raw OTP codes are never persisted.
-- Only their SHA-256 hex digests are stored. Service-role access only.
-- =============================================================================

CREATE TABLE public.guest_order_recovery_codes (

  id            uuid        NOT NULL DEFAULT gen_random_uuid(),

  -- UUID of the matched guest order.
  -- Intentionally NOT a foreign key to public.orders.
  -- A FK constraint would raise a Postgres error on an invalid order_id,
  -- which could leak confirmation that a given UUID exists or doesn't
  -- through observable error shape differences. The edge function validates
  -- order ownership independently via the service client.
  order_id      uuid        NOT NULL,

  -- SHA-256(normalized E.164 phone  OR  lowercase-trimmed email).
  -- 64 lowercase hex characters. Raw contact is never written here.
  contact_hash  text        NOT NULL
                  CHECK (char_length(contact_hash) = 64),

  -- SHA-256(zero-padded 6-digit OTP string, e.g. "042187").
  -- 64 lowercase hex characters. Raw OTP is never written here.
  -- Short-lived by design: expires_at caps the useful window to 10 minutes.
  -- SHA-256 is appropriate here (not bcrypt/argon2) because: the code space
  -- is only 1,000,000 values but attempt_count caps tries at 5 per row,
  -- making pre-image search economically infeasible within the TTL.
  code_hash     text        NOT NULL
                  CHECK (char_length(code_hash) = 64),

  -- Row expires 10 minutes after creation. Expired rows are inert: the edge
  -- function rejects them regardless of consumed_at state.
  expires_at    timestamptz NOT NULL,

  -- NULL     = code has not been used yet.
  -- NOT NULL = code was consumed; any further attempt on this row is rejected,
  --            even with the correct code (replay prevention).
  -- Must be set atomically:
  --   UPDATE ... SET consumed_at = now()
  --   WHERE id = $id AND consumed_at IS NULL
  -- The 0-row result means a concurrent request won the race — reject.
  consumed_at   timestamptz,

  -- Incremented on every failed verification attempt.
  -- The edge function hard-rejects any row where attempt_count >= 5, even if
  -- the supplied code would hash correctly. This caps brute-force exposure of
  -- the 6-digit space to 5 guesses per issued code regardless of timing.
  attempt_count integer     NOT NULL DEFAULT 0
                  CHECK (attempt_count >= 0),

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT guest_order_recovery_codes_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.guest_order_recovery_codes IS
  'Short-lived hashed OTP records for the guest order recovery flow. '
  'Raw contact values and OTP codes are never stored. '
  'Service-role access only — no anon or authenticated policies.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Used by verify-guest-order-access to find the active, unconsumed row for a
-- given order + contact pair during verification.
-- Partial on consumed_at IS NULL: spent rows are automatically excluded,
-- keeping the index small relative to the full table.
CREATE INDEX idx_gorec_order_contact_active
  ON public.guest_order_recovery_codes (order_id, contact_hash)
  WHERE consumed_at IS NULL;

-- Used by a periodic cleanup job (cron or manual) to prune expired rows.
-- Without this, a full sequential scan is required to find old rows.
CREATE INDEX idx_gorec_expires_at
  ON public.guest_order_recovery_codes (expires_at);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.guest_order_recovery_codes ENABLE ROW LEVEL SECURITY;

-- No policies are created for anon or authenticated roles.
-- With RLS enabled and no permissive policies, Postgres denies all access
-- from the anon key and from authenticated JWTs by default.
-- Edge functions use the service role key (via supabaseAdmin()), which
-- bypasses RLS entirely — this is the same access pattern used by:
--   public.checkout_challenges       (OTP pre-checkout gate)
--   public.checkout_risk_events      (velocity tracking)
--   public.guest_rate_limits         (IP rate limiting)
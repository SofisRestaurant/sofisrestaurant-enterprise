-- =============================================================================
-- Migration: Guest Checkout Support (Pending Carts Core)
-- =============================================================================

-- ─── pending_carts: guest support ────────────────────────────────────────────

ALTER TABLE public.pending_carts
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.pending_carts
  ADD COLUMN IF NOT EXISTS guest_email  TEXT CHECK (char_length(guest_email) <= 254),
  ADD COLUMN IF NOT EXISTS guest_token  TEXT CHECK (guest_token ~ '^[A-Za-z0-9_-]{8,64}$');

-- Identity enforcement (FIXED SAFE VERSION)
ALTER TABLE public.pending_carts
  ADD CONSTRAINT pending_carts_identity_check
  CHECK (
    (user_id IS NOT NULL AND guest_email IS NULL AND guest_token IS NULL)
    OR
    (user_id IS NULL AND guest_email IS NOT NULL AND guest_token IS NOT NULL)
  );

-- ─── indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pending_carts_guest_token
  ON public.pending_carts (guest_token)
  WHERE guest_token IS NOT NULL AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pending_carts_idempotency_guest
  ON public.pending_carts (idempotency_key)
  WHERE user_id IS NULL AND consumed_at IS NULL;
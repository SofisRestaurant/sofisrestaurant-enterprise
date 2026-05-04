-- supabase/migrations/YYYYMMDDHHMMSS_stripe_webhook_events.sql
-- =============================================================================
-- Creates the stripe_webhook_events table used by the idempotency guard in
-- supabase/functions/stripe-webhook/shared/idempotency.ts
--
-- Idempotent: safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     TEXT        PRIMARY KEY,
  event_type   TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for time-based pruning (optional maintenance job).
CREATE INDEX IF NOT EXISTS stripe_webhook_events_processed_at_idx
  ON public.stripe_webhook_events (processed_at);

-- RLS: service role bypasses RLS. Block all direct user access.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency log for Stripe webhook events. One row per event_id. '
  'Prevents double-processing on Stripe retries.';
-- =============================================================================
-- Migration: add_pickup_time
-- Path: supabase/migrations/20260422000000_add_pickup_time.sql
-- =============================================================================
-- Adds pickup_time to the orders table and (optionally) to pending_carts.
--
-- DESIGN DECISIONS:
--   1. pickup_time is TIMESTAMPTZ, nullable. NULL = ASAP. Only meaningful
--      for pickup orders, but no DB-level constraint enforces this because:
--        a) the app enforces it (only sent when order_type = 'pickup')
--        b) future order types (e.g. curbside) may also use it
--
--   2. pending_carts stores pickup_time as TEXT (ISO 8601) so it can be
--      attached to Stripe metadata (which is string-only) without a
--      round-trip parse. The webhook reads it from Stripe metadata and
--      writes it as TIMESTAMPTZ to orders — the canonical typed column.
--
--   3. No CHECK constraint on pickup_time > created_at because PostgreSQL
--      evaluates CHECK at INSERT time, not "order creation" time, making
--      time-window enforcement unreliable. Validated by the app instead.
--
--   4. The index on orders.pickup_time supports kitchen-dashboard queries
--      like "all upcoming pickup orders in the next 2 hours."
-- =============================================================================

-- ─── orders ──────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_time TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pickup_time
  ON public.orders (pickup_time)
  WHERE pickup_time IS NOT NULL;

COMMENT ON COLUMN public.orders.pickup_time IS
  'Requested pickup time (UTC). NULL means ASAP. Sourced from Stripe session '
  'metadata via the stripe-webhook function. Only populated for pickup orders.';

-- ─── pending_carts ───────────────────────────────────────────────────────────
-- Stores the raw ISO 8601 string so it can be attached to Stripe metadata
-- without a parse/format round-trip. Stripe metadata values are strings only.

ALTER TABLE public.pending_carts
  ADD COLUMN IF NOT EXISTS pickup_time TEXT DEFAULT NULL
    CHECK (pickup_time IS NULL OR char_length(pickup_time) <= 32);

COMMENT ON COLUMN public.pending_carts.pickup_time IS
  'ISO 8601 string passed through to Stripe metadata. '
  'The webhook converts it to TIMESTAMPTZ when writing orders.pickup_time.';
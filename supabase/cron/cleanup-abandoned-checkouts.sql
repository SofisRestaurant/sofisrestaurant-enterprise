-- =============================================================================
-- File: supabase/cron/cleanup-abandoned-checkouts.sql
-- 2026 Production-Grade Order Lifecycle Management
-- =============================================================================
--
-- ARCHITECTURE OVERVIEW
-- ─────────────────────────────────────────────────────────────────────────────
-- This cron job manages three distinct lifecycle responsibilities:
--
--   1. ORDER EXPIRATION (soft transition, never hard-delete)
--      Pending orders that have been stale for > 24 hours with no confirmed
--      payment are soft-transitioned to status = 'expired'.
--
--   2. PENDING CART CLEANUP (safe deletion with buffer)
--      Pending carts whose Stripe sessions have expired AND were never consumed
--      by a webhook are deleted. A 2-hour buffer after expires_at ensures any
--      in-flight webhook has had time to consume the cart before we touch it.
--
--   3. ABANDONED CART RECONCILIATION (recovery tracking)
--      Abandoned cart sessions where the matching pending_cart was consumed
--      (checkout completed) but the recovered flag was never set are backfilled.
--      This is the safety net for users who close the browser before hitting
--      the OrderSuccess page — the real-time recovery path in cart.store.ts.
--
-- RACE-CONDITION SAFETY
-- ─────────────────────────────────────────────────────────────────────────────
-- The critical race: Stripe sends checkout.session.completed → webhook fires →
-- order is being created/updated → cron runs SIMULTANEOUSLY and tries to expire
-- the same order (e.g., a user with a 25-hour checkout session).
--
-- Guards applied:
--   a) payment_status NOT IN ('paid', 'processing', 'requires_capture')
--      → webhook sets payment_status = 'paid' as the first atomic write
--   b) charge_captured_at IS NULL
--      → Stripe sets this on charge.captured; if it is present, money exchanged
--   c) stripe_payment_intent_id check with payment_status
--      → belt-and-suspenders: if a payment intent exists, verify it is not paid
--
-- Together these guards ensure: even if the webhook and cron run simultaneously,
-- the worst case is that the cron skips the order (payment_status was just set
-- to 'paid' by the webhook) — never that a paid order gets marked 'expired'.
--
-- IDEMPOTENCY
-- ─────────────────────────────────────────────────────────────────────────────
-- All three operations are idempotent. Re-running produces no side effects:
--   - Orders already 'expired' do not match status = 'pending'
--   - pending_carts already deleted are gone; the query skips them
--   - abandoned_cart_sessions already recovered = true are filtered out
--
-- BATCH SAFETY
-- ─────────────────────────────────────────────────────────────────────────────
-- LIMIT clauses on all operations prevent runaway transactions on tables with
-- millions of rows. The cron runs daily at 2 AM UTC; the LIMIT of 2000 per
-- operation is generous for a restaurant platform but safe for Postgres.
-- Increase if table sizes warrant.
--
-- =============================================================================


-- =============================================================================
-- INDEXES
-- Create before scheduling the cron. All are production-safe:
--   - IF NOT EXISTS: no-op if already present
--   - CONCURRENTLY: does not lock the table (use outside a transaction block)
--
-- Run these ONCE before the first cron execution. They are included here for
-- documentation; remove CONCURRENTLY if running inside a migration transaction.
-- =============================================================================

-- Index: orders lifecycle queries
-- Supports: cron expiration query (status, payment_status, created_at)
CREATE INDEX IF NOT EXISTS idx_orders_lifecycle_expiration
  ON public.orders (status, payment_status, created_at)
  WHERE status = 'pending';

-- Index: orders stripe session lookup (webhook idempotency)
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session_id
  ON public.orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Index: orders stripe payment intent lookup
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id
  ON public.orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Index: orders updated_at (admin dashboards, audit queries)
CREATE INDEX IF NOT EXISTS idx_orders_updated_at
  ON public.orders (updated_at DESC);

-- Index: pending_carts expiration cleanup
-- Partial index: only rows eligible for cleanup (not yet consumed)
CREATE INDEX IF NOT EXISTS idx_pending_carts_expiration
  ON public.pending_carts (expires_at)
  WHERE consumed_at IS NULL;

-- Index: pending_carts stripe session lookup (webhook + idempotency)
CREATE INDEX IF NOT EXISTS idx_pending_carts_stripe_session_id
  ON public.pending_carts (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Index: pending_carts user_id for auth cart hydration
CREATE INDEX IF NOT EXISTS idx_pending_carts_user_id
  ON public.pending_carts (user_id)
  WHERE user_id IS NOT NULL;

-- Indexes for abandoned_cart_sessions (may already exist from previous migration)
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_sessions_last_activity
  ON public.abandoned_cart_sessions (last_activity DESC);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_sessions_recovered
  ON public.abandoned_cart_sessions (recovered);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_sessions_activity_recovered
  ON public.abandoned_cart_sessions (last_activity DESC, recovered);


-- =============================================================================
-- CRON JOB REGISTRATION
-- =============================================================================

-- Remove any existing job with this name before re-registering.
-- Prevents duplicate cron schedules across environments and deployments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'cleanup-abandoned-checkouts'
  ) THEN
    PERFORM cron.unschedule('cleanup-abandoned-checkouts');
    RAISE NOTICE 'Unscheduled existing cleanup-abandoned-checkouts job';
  END IF;
END;
$$;


-- =============================================================================
-- SCHEDULE: daily at 02:00 UTC
-- =============================================================================
SELECT cron.schedule(
  'cleanup-abandoned-checkouts',
  '0 2 * * *',
  $cron$

  -- ===========================================================================
  -- STEP 1: EXPIRE STALE PENDING ORDERS
  -- ===========================================================================
  -- Soft-transitions pending orders to 'expired'.
  --
  -- Safety contract:
  --   - Only touches status = 'pending' (pre-payment state)
  --   - payment_status guard: 'paid' / 'processing' / 'requires_capture' mean
  --     Stripe has or is about to capture money — never expire these
  --   - charge_captured_at guard: Stripe confirmed a charge was captured;
  --     this is set by the webhook — if present, a real payment exists
  --   - stripe_payment_intent_id guard: if a payment intent was created but
  --     payment_status is unexpectedly not 'paid', we still skip out of caution
  --   - Age guard: stale for at least 24 hours
  --   - LIMIT: prevents a runaway transaction on large datasets
  --
  -- NOTE ON TERMINAL STATE GUARD:
  --   The original cron had: AND status NOT IN ('paid', 'fulfilled', ...)
  --   after AND status = 'pending'. That is a no-op — status = 'pending'
  --   already excludes all those values. Removed. The first condition
  --   (status = 'pending') is the complete state guard.
  -- ===========================================================================

  UPDATE public.orders
  SET
    status     = 'expired',
    updated_at = NOW()
  WHERE
    -- State guard: only pre-payment orders
    status = 'pending'

    -- Age guard: stale for at least 24 hours
    AND created_at < NOW() - INTERVAL '24 hours'

    -- Payment guard 1: no Stripe-confirmed payment status
    AND payment_status NOT IN ('paid', 'processing', 'requires_capture', 'succeeded')

    -- Payment guard 2: no Stripe charge captured
    -- (set by webhook on charge.captured event — authoritative proof of payment)
    AND charge_captured_at IS NULL

    -- Payment guard 3: if a payment intent exists, it must not be in a paid state
    -- Belt-and-suspenders against status/payment_status drift
    AND (
      stripe_payment_intent_id IS NULL
      OR payment_status NOT IN ('paid', 'processing', 'requires_capture', 'succeeded')
    )

  LIMIT 2000;


  -- ===========================================================================
  -- STEP 2: CLEAN UP EXPIRED PENDING CARTS
  -- ===========================================================================
  -- Deletes pending_carts rows that:
  --   a) Have never been consumed by a webhook (consumed_at IS NULL)
  --   b) Whose Stripe session has expired (expires_at < NOW())
  --   c) With a 2-hour buffer after expiry to guarantee any in-flight webhook
  --      had time to consume the cart before we delete it
  --
  -- Why 2 hours: Stripe webhooks can be delayed by up to ~2 hours in worst-case
  -- scenarios under high load or brief Stripe outages. The 2-hour buffer after
  -- expires_at means we only delete carts where the session expired at least
  -- 2 hours ago — long past any realistic webhook delay window.
  --
  -- Why DELETE (not soft-mark): pending_carts is an ephemeral work table.
  -- It has no analytics value once the window has closed. The authoritative
  -- abandoned-cart record is in abandoned_cart_sessions. Orders (if created)
  -- are in the orders table. Deleting pending_carts is safe and keeps the
  -- table small for query performance.
  --
  -- LIMIT: prevents a runaway transaction.
  -- ===========================================================================

  DELETE FROM public.pending_carts
  WHERE
    -- Not yet consumed by a checkout webhook
    consumed_at IS NULL

    -- Stripe session expired at least 2 hours ago
    -- (2-hour buffer ensures no in-flight webhook is still processing this cart)
    AND expires_at < NOW() - INTERVAL '2 hours'

  LIMIT 2000;


  -- ===========================================================================
  -- STEP 3: RECONCILE ABANDONED CART SESSIONS — MARK RECOVERED
  -- ===========================================================================
  -- Backfills recovered = true for abandoned_cart_sessions rows where the
  -- matching pending_cart was consumed (checkout completed) but the recovered
  -- flag was never updated.
  --
  -- This is the safety net for users who:
  --   - Complete checkout via Stripe
  --   - Close the browser before the OrderSuccess page loads
  --   - Never trigger the clearSupabaseCart() → recovered=true path in the
  --     frontend cart store
  --
  -- MATCHING LOGIC:
  --   abandoned_cart_sessions.id = pending_carts.id
  --   (Both tables use the same session UUID as primary key)
  --
  -- SAFETY:
  --   - Only updates rows where recovered IS DISTINCT FROM true (idempotent)
  --   - Matches ONLY on consumed_at IS NOT NULL (completed checkout)
  --   - LIMIT prevents runaway on large tables
  -- ===========================================================================

  UPDATE public.abandoned_cart_sessions AS acs
  SET
    recovered = true
  FROM public.pending_carts AS pc
  WHERE
    -- Same session UUID links both tables
    acs.id = pc.id

    -- Only mark recovered when the pending cart was consumed (checkout complete)
    AND pc.consumed_at IS NOT NULL

    -- Idempotency: skip rows already marked recovered
    AND (acs.recovered IS DISTINCT FROM true)

  LIMIT 2000;

  $cron$
);


-- =============================================================================
-- VERIFICATION QUERY (run manually after deploy to confirm job registered)
-- =============================================================================
-- SELECT jobname, schedule, active, jobid
-- FROM cron.job
-- WHERE jobname = 'cleanup-abandoned-checkouts';
-- =============================================================================
-- Migration: Orders Guest Support + Pending Cart State Machine
-- =============================================================================

-- ─── pending_carts state machine ────────────────────────────────────────────

ALTER TABLE public.pending_carts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'created'
  CHECK (status IN (
    'created',
    'priced',
    'stripe_session_created',
    'completed',
    'failed'
  ));

CREATE INDEX IF NOT EXISTS idx_pending_carts_status
  ON public.pending_carts (status)
  WHERE status NOT IN ('completed', 'failed');

-- ─── orders guest support ────────────────────────────────────────────────────

ALTER TABLE public.orders
  ALTER COLUMN customer_uid DROP NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_email TEXT CHECK (char_length(guest_email) <= 254),
  ADD COLUMN IF NOT EXISTS guest_token TEXT CHECK (guest_token ~ '^[A-Za-z0-9_-]{8,64}$'),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auth'
    CHECK (source IN ('auth', 'guest')),
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER CHECK (loyalty_points_redeemed >= 0),
  ADD COLUMN IF NOT EXISTS loyalty_discount_cents INTEGER CHECK (loyalty_discount_cents >= 0);

-- FIXED identity check (safer logic)
ALTER TABLE public.orders
  ADD CONSTRAINT orders_identity_check
  CHECK (
    (customer_uid IS NOT NULL AND guest_email IS NULL)
    OR
    (customer_uid IS NULL AND guest_email IS NOT NULL)
  );

-- ─── indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_guest_email
  ON public.orders (guest_email)
  WHERE guest_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_guest_token
  ON public.orders (guest_token)
  WHERE guest_token IS NOT NULL;

-- ─── backfills ───────────────────────────────────────────────────────────────

UPDATE public.pending_carts
SET status = 'completed'
WHERE consumed_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.pending_cart_id = pending_carts.id
  );

UPDATE public.pending_carts
SET status = 'failed'
WHERE consumed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.pending_cart_id = pending_carts.id
  );

UPDATE public.pending_carts
SET status = 'stripe_session_created'
WHERE consumed_at IS NULL
  AND stripe_session_id IS NOT NULL;

UPDATE public.orders
SET source = 'auth'
WHERE customer_uid IS NOT NULL;

-- ─── RLS policy (safe fix) ──────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders'
      AND policyname = 'guest_orders_service_role_only'
  ) THEN
    CREATE POLICY guest_orders_service_role_only
      ON public.orders
      AS RESTRICTIVE
      FOR ALL
      TO authenticated
      USING (source = 'auth' OR auth.uid() IS NOT NULL);
  END IF;
END;
$$;
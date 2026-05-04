-- ============================================================
-- Migration: 20260308000001_add_order_payment_columns.sql
-- Purpose:   Harden the orders table with full Stripe payment
--            tracking, dispute, refund, and tax breakdown fields.
-- Author:    Auto-generated 2026
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE payment_status_enum AS ENUM (
    'pending',
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'succeeded',
    'canceled',
    'failed',
    'refunded',
    'partially_refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_type_enum AS ENUM (
    'card',
    'apple_pay',
    'google_pay',
    'link',
    'affirm',
    'afterpay_clearpay',
    'klarna',
    'us_bank_account',
    'cashapp',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dispute_status_enum AS ENUM (
    'none',
    'warning_needs_response',
    'warning_under_review',
    'warning_closed',
    'needs_response',
    'under_review',
    'charge_refunded',
    'won',
    'lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------
-- 2. Stripe identity columns
-- ----------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charge_id           TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id         TEXT,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id          TEXT;

-- Unique indexes so lookups from webhooks are O(1)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id
  ON orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_checkout_session_id
  ON orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_charge_id
  ON orders (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 3. Payment status and method
-- ----------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status       payment_status_enum      NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_method_type  payment_method_type_enum NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS currency             CHAR(3)                  NOT NULL DEFAULT 'usd';

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status);

-- ----------------------------------------------------------------
-- 4. Money breakdown (all stored as integer cents)
-- ----------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS subtotal_cents          INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  ADD COLUMN IF NOT EXISTS tax_cents               INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  ADD COLUMN IF NOT EXISTS tip_cents               INTEGER NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  ADD COLUMN IF NOT EXISTS discount_cents          INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_cents      INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  ADD COLUMN IF NOT EXISTS service_fee_cents       INTEGER NOT NULL DEFAULT 0 CHECK (service_fee_cents >= 0),
  ADD COLUMN IF NOT EXISTS total_cents             INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  ADD COLUMN IF NOT EXISTS amount_received_cents   INTEGER NOT NULL DEFAULT 0 CHECK (amount_received_cents >= 0),
  ADD COLUMN IF NOT EXISTS refunded_amount_cents   INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS net_amount_cents        INTEGER GENERATED ALWAYS AS (
                               total_cents - refunded_amount_cents
                             ) STORED;

-- ----------------------------------------------------------------
-- 5. Dispute tracking
-- ----------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dispute_status     dispute_status_enum NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS disputed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_due_by     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_reason     TEXT,
  ADD COLUMN IF NOT EXISTS dispute_amount_cents INTEGER CHECK (dispute_amount_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_orders_dispute_status ON orders (dispute_status)
  WHERE dispute_status <> 'none';

CREATE INDEX IF NOT EXISTS idx_orders_dispute_due_by ON orders (dispute_due_by)
  WHERE dispute_due_by IS NOT NULL;

-- ----------------------------------------------------------------
-- 6. Lifecycle timestamps
-- ----------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS charge_captured_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_failed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_error   TEXT;

-- ----------------------------------------------------------------
-- 7. Composite indexes for admin dashboards
-- ----------------------------------------------------------------

-- Admin disputed orders list
CREATE INDEX IF NOT EXISTS idx_orders_dispute_admin
  ON orders (dispute_status, dispute_due_by, total_cents)
  WHERE dispute_status NOT IN ('none', 'won', 'lost', 'charge_refunded');

-- Payment health monitor
CREATE INDEX IF NOT EXISTS idx_orders_payment_health
  ON orders (payment_status, charge_captured_at DESC)
  WHERE payment_status IN ('failed', 'requires_action');

-- Tax reporting join key
CREATE INDEX IF NOT EXISTS idx_orders_charge_captured_at
  ON orders (charge_captured_at DESC)
  WHERE charge_captured_at IS NOT NULL;

-- ----------------------------------------------------------------
-- 8. Row-level security (preserve existing policy pattern)
-- ----------------------------------------------------------------

-- Admins can read/write all payment data
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'admin_full_access_orders'
  ) THEN
    CREATE POLICY admin_full_access_orders ON orders
      FOR ALL
      TO authenticated
      USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      );
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 9. Updated_at trigger (idempotent)
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------
-- 10. Validation constraint: total must reconcile
-- ----------------------------------------------------------------

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_total_reconcile;
ALTER TABLE orders ADD CONSTRAINT chk_order_total_reconcile
  CHECK (
    total_cents = subtotal_cents + tax_cents + tip_cents
                + delivery_fee_cents + service_fee_cents
                - discount_cents
    OR total_cents = 0  -- allow zero during creation
  );

COMMIT;
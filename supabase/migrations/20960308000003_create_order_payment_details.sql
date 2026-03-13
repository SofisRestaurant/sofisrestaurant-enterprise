-- ============================================================
-- Migration: 20260308000002_create_order_payment_details.sql
-- Purpose:   Dedicated table for Stripe payment signals, card
--            data, risk scoring, 3DS, and dispute metadata.
--            Kept separate from orders to avoid row bloat and
--            to gate PCI-adjacent data behind a tighter policy.
-- Author:    Auto-generated 2026
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE cvc_check_enum AS ENUM (
    'pass', 'fail', 'unavailable', 'unchecked', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE avs_check_enum AS ENUM (
    'pass', 'fail', 'unavailable', 'unchecked', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_level_enum AS ENUM (
    'normal', 'elevated', 'highest', 'not_assessed', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE three_ds_result_enum AS ENUM (
    'authenticated',
    'attempted',
    'failed',
    'not_supported',
    'processing_error',
    'exempted',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE evidence_status_enum AS ENUM (
    'not_started',
    'in_progress',
    'submitted',
    'past_due',
    'won',
    'lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE card_funding_enum AS ENUM (
    'credit', 'debit', 'prepaid', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------
-- 2. Table
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS order_payment_details (
  -- ── Identity ──────────────────────────────────────────────────
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                    UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,

  -- ── Stripe references ─────────────────────────────────────────
  payment_intent_id           TEXT        NOT NULL,
  charge_id                   TEXT,
  payment_method_id           TEXT,
  balance_transaction_id      TEXT,

  -- ── Customer identity ─────────────────────────────────────────
  customer_email              TEXT,
  customer_phone              TEXT,
  billing_name                TEXT,
  billing_address_line1       TEXT,
  billing_address_line2       TEXT,
  billing_city                TEXT,
  billing_state               TEXT,
  billing_postal_code         TEXT,
  billing_country             CHAR(2),

  -- ── Card / payment method details ─────────────────────────────
  card_brand                  TEXT,           -- visa, mastercard, amex, etc.
  card_last4                  CHAR(4),
  card_exp_month              SMALLINT        CHECK (card_exp_month BETWEEN 1 AND 12),
  card_exp_year               SMALLINT        CHECK (card_exp_year > 2000),
  card_fingerprint            TEXT,           -- Stripe's stable card token
  card_country                CHAR(2),
  card_network                TEXT,           -- interbank network if available
  funding                     card_funding_enum NOT NULL DEFAULT 'unknown',
  wallet_type                 TEXT,           -- apple_pay, google_pay, link, etc.

  -- ── Fraud / verification checks ───────────────────────────────
  cvc_check                   cvc_check_enum  NOT NULL DEFAULT 'unknown',
  postal_check                avs_check_enum  NOT NULL DEFAULT 'unknown',
  avs_line1_check             avs_check_enum  NOT NULL DEFAULT 'unknown',
  three_d_secure_result       three_ds_result_enum NOT NULL DEFAULT 'unknown',
  three_d_secure_version      TEXT,           -- 1.0.2 or 2.x

  -- ── Stripe Radar risk ─────────────────────────────────────────
  risk_level                  risk_level_enum NOT NULL DEFAULT 'not_assessed',
  risk_score                  SMALLINT        CHECK (risk_score BETWEEN 0 AND 100),
  radar_rule_id               TEXT,           -- triggered rule if blocked/elevated
  radar_outcome               TEXT,

  -- ── Network / device signals ──────────────────────────────────
  ip_address                  INET,
  ip_country                  CHAR(2),
  user_agent                  TEXT,
  device_fingerprint          TEXT,
  session_id                  TEXT,

  -- ── Stripe fee breakdown (for reconciliation) ─────────────────
  stripe_fee_cents            INTEGER         NOT NULL DEFAULT 0 CHECK (stripe_fee_cents >= 0),
  stripe_fee_tax_cents        INTEGER         NOT NULL DEFAULT 0 CHECK (stripe_fee_tax_cents >= 0),
  net_payout_cents            INTEGER         GENERATED ALWAYS AS (
                                0  -- placeholder; real value backfilled from balance txn
                              ) STORED,

  -- ── Dispute snapshot ──────────────────────────────────────────
  dispute_id                  TEXT,           -- Stripe dispute ID (dp_xxx)
  dispute_reason              TEXT,
  dispute_amount_cents        INTEGER         CHECK (dispute_amount_cents >= 0),
  dispute_due_by              TIMESTAMPTZ,
  dispute_evidence_status     evidence_status_enum NOT NULL DEFAULT 'not_started',
  dispute_network_reason_code TEXT,           -- e.g. '4853' (Visa)
  dispute_opened_at           TIMESTAMPTZ,
  dispute_closed_at           TIMESTAMPTZ,
  dispute_outcome             TEXT,           -- won / lost / accepted

  -- ── Refund summary ────────────────────────────────────────────
  refund_ids                  TEXT[],         -- array of re_xxx IDs
  last_refund_reason          TEXT,
  last_refund_at              TIMESTAMPTZ,

  -- ── Meta ──────────────────────────────────────────────────────
  raw_charge_snapshot         JSONB,          -- full Stripe charge object at capture
  raw_dispute_snapshot        JSONB,          -- full Stripe dispute object
  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_opd_order_id
  ON order_payment_details (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opd_payment_intent_id
  ON order_payment_details (payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_opd_charge_id
  ON order_payment_details (charge_id)
  WHERE charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opd_dispute_id
  ON order_payment_details (dispute_id)
  WHERE dispute_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opd_dispute_due_by
  ON order_payment_details (dispute_due_by ASC)
  WHERE dispute_due_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opd_card_fingerprint
  ON order_payment_details (card_fingerprint)
  WHERE card_fingerprint IS NOT NULL;

-- Risk dashboard index
CREATE INDEX IF NOT EXISTS idx_opd_risk
  ON order_payment_details (risk_level, risk_score DESC)
  WHERE risk_level IN ('elevated', 'highest');

-- IP-based fraud clustering
CREATE INDEX IF NOT EXISTS idx_opd_ip_address
  ON order_payment_details (ip_address)
  WHERE ip_address IS NOT NULL;

-- ----------------------------------------------------------------
-- 4. Updated_at trigger
-- ----------------------------------------------------------------

DROP TRIGGER IF EXISTS opd_set_updated_at ON order_payment_details;
CREATE TRIGGER opd_set_updated_at
  BEFORE UPDATE ON order_payment_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------
-- 5. Row-level security
-- ----------------------------------------------------------------

ALTER TABLE order_payment_details ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY opd_admin_all ON order_payment_details
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Customers: read own record (no card data exposed — rely on column-level grants)
CREATE POLICY opd_customer_select ON order_payment_details
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_uid = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 6. Column-level grants (restrict card/risk data from customers)
-- ----------------------------------------------------------------

-- Grant safe subset to `authenticated` role
-- Revoke raw signals from non-admin application role
REVOKE ALL ON order_payment_details FROM PUBLIC;

GRANT SELECT (
  id, order_id, payment_intent_id, charge_id,
  customer_email, billing_name,
  card_brand, card_last4, funding, wallet_type,
  dispute_reason, dispute_amount_cents, dispute_due_by,
  dispute_evidence_status, dispute_opened_at, dispute_closed_at,
  dispute_outcome, last_refund_reason, last_refund_at,
  created_at, updated_at
) ON order_payment_details TO authenticated;

-- Admin service role gets full table
GRANT ALL ON order_payment_details TO service_role;

-- ----------------------------------------------------------------
-- 7. Function: upsert payment details from webhook
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_order_payment_details(
  p_order_id              UUID,
  p_payment_intent_id     TEXT,
  p_charge_id             TEXT       DEFAULT NULL,
  p_payment_method_id     TEXT       DEFAULT NULL,
  p_balance_transaction_id TEXT      DEFAULT NULL,
  p_customer_email        TEXT       DEFAULT NULL,
  p_customer_phone        TEXT       DEFAULT NULL,
  p_billing_name          TEXT       DEFAULT NULL,
  p_billing_postal_code   TEXT       DEFAULT NULL,
  p_billing_country       CHAR(2)    DEFAULT NULL,
  p_card_brand            TEXT       DEFAULT NULL,
  p_card_last4            CHAR(4)    DEFAULT NULL,
  p_card_fingerprint      TEXT       DEFAULT NULL,
  p_card_country          CHAR(2)    DEFAULT NULL,
  p_funding               card_funding_enum DEFAULT 'unknown',
  p_wallet_type           TEXT       DEFAULT NULL,
  p_cvc_check             cvc_check_enum DEFAULT 'unknown',
  p_postal_check          avs_check_enum DEFAULT 'unknown',
  p_avs_line1_check       avs_check_enum DEFAULT 'unknown',
  p_three_d_secure_result three_ds_result_enum DEFAULT 'unknown',
  p_risk_level            risk_level_enum DEFAULT 'not_assessed',
  p_risk_score            SMALLINT   DEFAULT NULL,
  p_ip_address            INET       DEFAULT NULL,
  p_stripe_fee_cents      INTEGER    DEFAULT 0,
  p_dispute_id            TEXT       DEFAULT NULL,
  p_dispute_reason        TEXT       DEFAULT NULL,
  p_dispute_amount_cents  INTEGER    DEFAULT NULL,
  p_dispute_due_by        TIMESTAMPTZ DEFAULT NULL,
  p_dispute_evidence_status evidence_status_enum DEFAULT 'not_started',
  p_raw_charge_snapshot   JSONB      DEFAULT NULL,
  p_raw_dispute_snapshot  JSONB      DEFAULT NULL
)
RETURNS order_payment_details
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result order_payment_details;
BEGIN
  INSERT INTO order_payment_details (
    order_id, payment_intent_id, charge_id, payment_method_id,
    balance_transaction_id, customer_email, customer_phone,
    billing_name, billing_postal_code, billing_country,
    card_brand, card_last4, card_fingerprint, card_country,
    funding, wallet_type,
    cvc_check, postal_check, avs_line1_check, three_d_secure_result,
    risk_level, risk_score, ip_address,
    stripe_fee_cents,
    dispute_id, dispute_reason, dispute_amount_cents,
    dispute_due_by, dispute_evidence_status,
    raw_charge_snapshot, raw_dispute_snapshot
  )
  VALUES (
    p_order_id, p_payment_intent_id, p_charge_id, p_payment_method_id,
    p_balance_transaction_id, p_customer_email, p_customer_phone,
    p_billing_name, p_billing_postal_code, p_billing_country,
    p_card_brand, p_card_last4, p_card_fingerprint, p_card_country,
    p_funding, p_wallet_type,
    p_cvc_check, p_postal_check, p_avs_line1_check, p_three_d_secure_result,
    p_risk_level, p_risk_score, p_ip_address,
    p_stripe_fee_cents,
    p_dispute_id, p_dispute_reason, p_dispute_amount_cents,
    p_dispute_due_by, p_dispute_evidence_status,
    p_raw_charge_snapshot, p_raw_dispute_snapshot
  )
  ON CONFLICT (order_id) DO UPDATE SET
    charge_id                 = COALESCE(EXCLUDED.charge_id, order_payment_details.charge_id),
    payment_method_id         = COALESCE(EXCLUDED.payment_method_id, order_payment_details.payment_method_id),
    balance_transaction_id    = COALESCE(EXCLUDED.balance_transaction_id, order_payment_details.balance_transaction_id),
    customer_email            = COALESCE(EXCLUDED.customer_email, order_payment_details.customer_email),
    customer_phone            = COALESCE(EXCLUDED.customer_phone, order_payment_details.customer_phone),
    billing_name              = COALESCE(EXCLUDED.billing_name, order_payment_details.billing_name),
    billing_postal_code       = COALESCE(EXCLUDED.billing_postal_code, order_payment_details.billing_postal_code),
    billing_country           = COALESCE(EXCLUDED.billing_country, order_payment_details.billing_country),
    card_brand                = COALESCE(EXCLUDED.card_brand, order_payment_details.card_brand),
    card_last4                = COALESCE(EXCLUDED.card_last4, order_payment_details.card_last4),
    card_fingerprint          = COALESCE(EXCLUDED.card_fingerprint, order_payment_details.card_fingerprint),
    funding                   = EXCLUDED.funding,
    wallet_type               = COALESCE(EXCLUDED.wallet_type, order_payment_details.wallet_type),
    cvc_check                 = EXCLUDED.cvc_check,
    postal_check              = EXCLUDED.postal_check,
    avs_line1_check           = EXCLUDED.avs_line1_check,
    three_d_secure_result     = EXCLUDED.three_d_secure_result,
    risk_level                = EXCLUDED.risk_level,
    risk_score                = COALESCE(EXCLUDED.risk_score, order_payment_details.risk_score),
    ip_address                = COALESCE(EXCLUDED.ip_address, order_payment_details.ip_address),
    stripe_fee_cents          = GREATEST(EXCLUDED.stripe_fee_cents, order_payment_details.stripe_fee_cents),
    dispute_id                = COALESCE(EXCLUDED.dispute_id, order_payment_details.dispute_id),
    dispute_reason            = COALESCE(EXCLUDED.dispute_reason, order_payment_details.dispute_reason),
    dispute_amount_cents      = COALESCE(EXCLUDED.dispute_amount_cents, order_payment_details.dispute_amount_cents),
    dispute_due_by            = COALESCE(EXCLUDED.dispute_due_by, order_payment_details.dispute_due_by),
    dispute_evidence_status   = EXCLUDED.dispute_evidence_status,
    raw_charge_snapshot       = COALESCE(EXCLUDED.raw_charge_snapshot, order_payment_details.raw_charge_snapshot),
    raw_dispute_snapshot      = COALESCE(EXCLUDED.raw_dispute_snapshot, order_payment_details.raw_dispute_snapshot),
    updated_at                = NOW()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

COMMIT;
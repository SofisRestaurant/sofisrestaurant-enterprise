-- ============================================================
-- Migration: 20260308000004_create_order_dispute_events.sql
-- Purpose:   Immutable event log for every Stripe dispute lifecycle
--            event (created → updated → closed) plus internal admin
--            actions (notes, evidence uploads, escalations).
--            Provides the full timeline needed in the dispute drawer.
-- Author:    Auto-generated 2026
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE dispute_event_source_enum AS ENUM (
    'stripe_webhook',
    'admin_action',
    'system',
    'customer_action'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dispute_event_type_enum AS ENUM (
    -- Stripe-originated
    'dispute_created',
    'dispute_updated',
    'dispute_funds_withdrawn',
    'dispute_funds_reinstated',
    'dispute_closed',
    'evidence_submitted',
    -- Internal admin actions
    'admin_note_added',
    'admin_evidence_uploaded',
    'admin_escalated',
    'admin_accepted',             -- admin chose not to fight
    'admin_reopened',
    -- System
    'due_date_reminder',
    'auto_flagged_high_risk',
    'evidence_completeness_checked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------
-- 2. Table
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS order_dispute_events (
  -- ── Identity ──────────────────────────────────────────────────
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  dispute_id              TEXT,                   -- Stripe dp_xxx (null for internal events)

  -- ── Event ─────────────────────────────────────────────────────
  event_type              dispute_event_type_enum     NOT NULL,
  event_source            dispute_event_source_enum   NOT NULL DEFAULT 'system',

  -- ── Stripe webhook metadata ────────────────────────────────────
  stripe_event_id         TEXT,                   -- evt_xxx, for deduplication
  stripe_event_type       TEXT,                   -- e.g. charge.dispute.created

  -- ── Before / after snapshots ──────────────────────────────────
  previous_status         TEXT,
  new_status              TEXT,
  previous_amount_cents   INTEGER,
  new_amount_cents        INTEGER,

  -- ── Actor ─────────────────────────────────────────────────────
  actor_id                UUID        REFERENCES profiles (id) ON DELETE SET NULL,
  actor_role              TEXT,                   -- admin, system, customer
  actor_name              TEXT,

  -- ── Content / payload ─────────────────────────────────────────
  note                    TEXT,                   -- admin notes / system messages
  evidence_urls           TEXT[],                 -- attached CDN URLs
  evidence_labels         TEXT[],                 -- matching labels for each URL
  metadata                JSONB,                  -- extra structured data

  -- ── Raw Stripe event ──────────────────────────────────────────
  raw_stripe_event        JSONB,

  -- ── Timestamps ────────────────────────────────────────────────
  occurred_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Note: this table is append-only; no updated_at
);

-- ----------------------------------------------------------------
-- 3. Immutability enforcement
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_dispute_event_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_dispute_events rows are immutable. Insert a new event instead.';
END;
$$;

DROP TRIGGER IF EXISTS ode_immutable ON order_dispute_events;
CREATE TRIGGER ode_immutable
  BEFORE UPDATE ON order_dispute_events
  FOR EACH ROW EXECUTE FUNCTION prevent_dispute_event_update();

-- ----------------------------------------------------------------
-- 4. Deduplication: skip duplicate Stripe events
-- ----------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_ode_stripe_event_id
  ON order_dispute_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 5. Indexes
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ode_order_id
  ON order_dispute_events (order_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ode_dispute_id
  ON order_dispute_events (dispute_id, occurred_at DESC)
  WHERE dispute_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ode_event_type
  ON order_dispute_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ode_actor_id
  ON order_dispute_events (actor_id)
  WHERE actor_id IS NOT NULL;

-- Admin queue: show orders with active disputes sorted by urgency
CREATE INDEX IF NOT EXISTS idx_ode_admin_queue
  ON order_dispute_events (order_id, event_type, occurred_at DESC)
  WHERE event_type IN ('dispute_created', 'dispute_updated', 'dispute_funds_withdrawn');

-- ----------------------------------------------------------------
-- 6. Row-level security
-- ----------------------------------------------------------------

ALTER TABLE order_dispute_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ode_admin_all ON order_dispute_events
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Customers can only see their own dispute timeline
CREATE POLICY ode_customer_select ON order_dispute_events
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_uid = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 7. Function: insert dispute event (idempotent on stripe_event_id)
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION insert_dispute_event(
  p_order_id              UUID,
  p_dispute_id            TEXT            DEFAULT NULL,
  p_event_type            dispute_event_type_enum DEFAULT 'dispute_created',
  p_event_source          dispute_event_source_enum DEFAULT 'stripe_webhook',
  p_stripe_event_id       TEXT            DEFAULT NULL,
  p_stripe_event_type     TEXT            DEFAULT NULL,
  p_previous_status       TEXT            DEFAULT NULL,
  p_new_status            TEXT            DEFAULT NULL,
  p_previous_amount_cents INTEGER         DEFAULT NULL,
  p_new_amount_cents      INTEGER         DEFAULT NULL,
  p_actor_id              UUID            DEFAULT NULL,
  p_actor_role            TEXT            DEFAULT 'system',
  p_actor_name            TEXT            DEFAULT NULL,
  p_note                  TEXT            DEFAULT NULL,
  p_evidence_urls         TEXT[]          DEFAULT NULL,
  p_evidence_labels       TEXT[]          DEFAULT NULL,
  p_metadata              JSONB           DEFAULT NULL,
  p_raw_stripe_event      JSONB           DEFAULT NULL,
  p_occurred_at           TIMESTAMPTZ     DEFAULT NOW()
)
RETURNS order_dispute_events
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result order_dispute_events;
BEGIN
  INSERT INTO order_dispute_events (
    order_id, dispute_id,
    event_type, event_source,
    stripe_event_id, stripe_event_type,
    previous_status, new_status,
    previous_amount_cents, new_amount_cents,
    actor_id, actor_role, actor_name,
    note, evidence_urls, evidence_labels,
    metadata, raw_stripe_event, occurred_at
  )
  VALUES (
    p_order_id, p_dispute_id,
    p_event_type, p_event_source,
    p_stripe_event_id, p_stripe_event_type,
    p_previous_status, p_new_status,
    p_previous_amount_cents, p_new_amount_cents,
    p_actor_id, p_actor_role, p_actor_name,
    p_note, p_evidence_urls, p_evidence_labels,
    p_metadata, p_raw_stripe_event, p_occurred_at
  )
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ----------------------------------------------------------------
-- 8. View: dispute timeline for the admin drawer
-- ----------------------------------------------------------------

CREATE OR REPLACE VIEW admin_dispute_timeline AS
SELECT
  ode.id,
  ode.order_id,
  ode.dispute_id,
  ode.event_type,
  ode.event_source,
  ode.previous_status,
  ode.new_status,
  ode.previous_amount_cents,
  ode.new_amount_cents,
  ode.actor_name,
  ode.actor_role,
  ode.note,
  ode.evidence_urls,
  ode.evidence_labels,
  ode.metadata,
  ode.occurred_at,
  o.stripe_payment_intent_id,
  o.total_cents,
  o.dispute_due_by,
  o.dispute_status
FROM order_dispute_events ode
JOIN orders o ON o.id = ode.order_id
ORDER BY ode.occurred_at DESC;

-- ----------------------------------------------------------------
-- 9. Function: get full dispute timeline for one order
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_order_dispute_timeline(p_order_id UUID)
RETURNS SETOF admin_dispute_timeline
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT *
  FROM admin_dispute_timeline
  WHERE order_id = p_order_id
  ORDER BY occurred_at ASC;
$$;

COMMIT;
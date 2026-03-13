-- ============================================================
-- Migration: 20260308000003_create_order_fulfillment_evidence.sql
-- Purpose:   Store all fulfillment proof — pickup PIN verification,
--            delivery photos, signatures, GPS coords, driver info —
--            needed to fight chargebacks and provide audit trails.
-- Author:    Auto-generated 2026
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE fulfillment_type_enum AS ENUM (
    'pickup',
    'curbside',
    'delivery',
    'dine_in',
    'drive_through',
    'ship'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fulfillment_evidence_status_enum AS ENUM (
    'pending',
    'partial',
    'complete',
    'flagged',
    'disputed',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE handoff_method_enum AS ENUM (
    'pin_verified',
    'signature',
    'photo',
    'staff_confirmed',
    'driver_confirmed',
    'contactless',
    'none'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------
-- 2. Table
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS order_fulfillment_evidence (
  -- ── Identity ──────────────────────────────────────────────────
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                    UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  fulfillment_type            fulfillment_type_enum NOT NULL DEFAULT 'pickup',

  -- ── Pickup evidence ───────────────────────────────────────────
  pickup_pin                  TEXT,                   -- hashed 4–6 digit code
  pickup_pin_verified_at      TIMESTAMPTZ,
  picked_up_by_name           TEXT,
  picked_up_by_id_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  staff_verified_by           UUID        REFERENCES profiles (id) ON DELETE SET NULL,
  staff_verified_at           TIMESTAMPTZ,
  pickup_station              TEXT,                   -- e.g. "Window 2", "Counter B"
  pickup_notes                TEXT,

  -- ── Delivery evidence ─────────────────────────────────────────
  delivery_address_snapshot   JSONB,                  -- frozen address at dispatch
  driver_id                   UUID        REFERENCES profiles (id) ON DELETE SET NULL,
  driver_name                 TEXT,
  driver_phone                TEXT,
  vehicle_description         TEXT,
  dispatched_at               TIMESTAMPTZ,
  out_for_delivery_at         TIMESTAMPTZ,
  arrived_at_door_at          TIMESTAMPTZ,
  delivered_at                TIMESTAMPTZ,
  delivery_photo_url          TEXT,                   -- CDN URL
  delivery_photo_taken_at     TIMESTAMPTZ,
  delivery_photo_lat          NUMERIC(10, 7),
  delivery_photo_lng          NUMERIC(10, 7),
  left_at_door                BOOLEAN     NOT NULL DEFAULT FALSE,
  safe_place_description      TEXT,                   -- "left by mailbox", etc.

  -- ── Signature ─────────────────────────────────────────────────
  signature_url               TEXT,                   -- CDN URL to signature PNG
  signature_captured_at       TIMESTAMPTZ,
  signature_ip                INET,

  -- ── Handoff / confirmation ────────────────────────────────────
  handoff_method              handoff_method_enum NOT NULL DEFAULT 'none',
  handoff_code                TEXT,                   -- one-time confirmation code
  handoff_code_verified_at    TIMESTAMPTZ,
  handoff_notes               TEXT,
  recipient_name              TEXT,
  recipient_verified          BOOLEAN     NOT NULL DEFAULT FALSE,

  -- ── GPS / location proof ──────────────────────────────────────
  gps_lat                     NUMERIC(10, 7),
  gps_lng                     NUMERIC(10, 7),
  gps_accuracy_meters         NUMERIC(8, 2),
  gps_recorded_at             TIMESTAMPTZ,
  geofence_check_passed       BOOLEAN,                -- was driver inside delivery zone?

  -- ── Dispute readiness score (0–100) ───────────────────────────
  -- Computed by trigger based on completeness of evidence fields
  evidence_completeness_score SMALLINT    NOT NULL DEFAULT 0
    CHECK (evidence_completeness_score BETWEEN 0 AND 100),

  -- ── Status ────────────────────────────────────────────────────
  evidence_status             fulfillment_evidence_status_enum NOT NULL DEFAULT 'pending',
  flagged_reason              TEXT,
  flagged_at                  TIMESTAMPTZ,
  flagged_by                  UUID        REFERENCES profiles (id) ON DELETE SET NULL,

  -- ── Meta ──────────────────────────────────────────────────────
  raw_driver_payload          JSONB,                  -- full driver app submission
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_ofe_order_id
  ON order_fulfillment_evidence (order_id);

CREATE INDEX IF NOT EXISTS idx_ofe_fulfillment_type
  ON order_fulfillment_evidence (fulfillment_type);

CREATE INDEX IF NOT EXISTS idx_ofe_evidence_status
  ON order_fulfillment_evidence (evidence_status)
  WHERE evidence_status IN ('pending', 'partial', 'flagged', 'disputed');

CREATE INDEX IF NOT EXISTS idx_ofe_delivered_at
  ON order_fulfillment_evidence (delivered_at DESC)
  WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ofe_driver_id
  ON order_fulfillment_evidence (driver_id)
  WHERE driver_id IS NOT NULL;

-- Dispute readiness index — surface weak evidence records
CREATE INDEX IF NOT EXISTS idx_ofe_low_completeness
  ON order_fulfillment_evidence (evidence_completeness_score ASC)
  WHERE evidence_completeness_score < 60;

-- 2D bounding box for GPS-based fraud detection
CREATE INDEX IF NOT EXISTS idx_ofe_gps
  ON order_fulfillment_evidence (gps_lat, gps_lng)
  WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL;

-- ----------------------------------------------------------------
-- 4. Trigger: auto-compute evidence completeness score
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_evidence_completeness()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  score INTEGER := 0;
BEGIN
  -- Pickup path
  IF NEW.fulfillment_type IN ('pickup', 'curbside', 'drive_through') THEN
    IF NEW.pickup_pin IS NOT NULL              THEN score := score + 15; END IF;
    IF NEW.pickup_pin_verified_at IS NOT NULL  THEN score := score + 25; END IF;
    IF NEW.picked_up_by_name IS NOT NULL       THEN score := score + 15; END IF;
    IF NEW.staff_verified_by IS NOT NULL       THEN score := score + 20; END IF;
    IF NEW.handoff_method <> 'none'            THEN score := score + 15; END IF;
    IF NEW.handoff_code_verified_at IS NOT NULL THEN score := score + 10; END IF;
  END IF;

  -- Delivery path
  IF NEW.fulfillment_type IN ('delivery', 'ship') THEN
    IF NEW.delivery_address_snapshot IS NOT NULL THEN score := score + 10; END IF;
    IF NEW.out_for_delivery_at IS NOT NULL        THEN score := score + 10; END IF;
    IF NEW.delivered_at IS NOT NULL               THEN score := score + 15; END IF;
    IF NEW.delivery_photo_url IS NOT NULL         THEN score := score + 20; END IF;
    IF NEW.delivery_photo_lat IS NOT NULL         THEN score := score + 10; END IF;
    IF NEW.signature_url IS NOT NULL              THEN score := score + 20; END IF;
    IF NEW.geofence_check_passed = TRUE           THEN score := score + 10; END IF;
    IF NEW.recipient_name IS NOT NULL             THEN score := score + 5;  END IF;
  END IF;

  -- Cap at 100
  NEW.evidence_completeness_score := LEAST(score, 100);

  -- Auto-upgrade status
  IF NEW.evidence_completeness_score = 100 THEN
    NEW.evidence_status := 'complete';
  ELSIF NEW.evidence_completeness_score > 0 AND NEW.evidence_status = 'pending' THEN
    NEW.evidence_status := 'partial';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ofe_compute_completeness ON order_fulfillment_evidence;
CREATE TRIGGER ofe_compute_completeness
  BEFORE INSERT OR UPDATE ON order_fulfillment_evidence
  FOR EACH ROW EXECUTE FUNCTION compute_evidence_completeness();

-- ----------------------------------------------------------------
-- 5. Updated_at trigger
-- ----------------------------------------------------------------

DROP TRIGGER IF EXISTS ofe_set_updated_at ON order_fulfillment_evidence;
CREATE TRIGGER ofe_set_updated_at
  BEFORE UPDATE ON order_fulfillment_evidence
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------
-- 6. Row-level security
-- ----------------------------------------------------------------

ALTER TABLE order_fulfillment_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY ofe_admin_all ON order_fulfillment_evidence
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY ofe_driver_own ON order_fulfillment_evidence
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

CREATE POLICY ofe_customer_select ON order_fulfillment_evidence
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_uid = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 7. Helper: get dispute-ready evidence summary for an order
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_evidence_summary(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ev order_fulfillment_evidence;
  result JSONB;
BEGIN
  SELECT * INTO ev
  FROM order_fulfillment_evidence
  WHERE order_id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', FALSE);
  END IF;

  result := jsonb_build_object(
    'found',                    TRUE,
    'fulfillment_type',         ev.fulfillment_type,
    'evidence_status',          ev.evidence_status,
    'completeness_score',       ev.evidence_completeness_score,
    'has_pickup_pin',           ev.pickup_pin IS NOT NULL,
    'pin_verified',             ev.pickup_pin_verified_at IS NOT NULL,
    'has_delivery_photo',       ev.delivery_photo_url IS NOT NULL,
    'has_signature',            ev.signature_url IS NOT NULL,
    'has_gps',                  ev.gps_lat IS NOT NULL,
    'geofence_passed',          ev.geofence_check_passed,
    'delivered_at',             ev.delivered_at,
    'handoff_method',           ev.handoff_method,
    'flagged',                  ev.flagged_at IS NOT NULL,
    'flag_reason',              ev.flagged_reason
  );

  RETURN result;
END;
$$;

COMMIT;
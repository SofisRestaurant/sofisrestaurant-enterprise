ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_customer_phone
  ON orders (customer_phone)
  WHERE customer_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_phone_verified
  ON orders (phone_verified)
  WHERE phone_verified = TRUE;

COMMENT ON COLUMN orders.phone_verified IS
  'True after customer confirmed phone via Twilio Verify OTP.';


CREATE TABLE IF NOT EXISTS sms_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event        TEXT        NOT NULL
                           CHECK (event IN ('confirmed','preparing','ready','delivered','cancelled')),
  phone_suffix TEXT        NOT NULL,
  twilio_sid   TEXT,
  status       TEXT        NOT NULL CHECK (status IN ('sent','failed')),
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_log_order_event
  ON sms_log (order_id, event);

CREATE INDEX IF NOT EXISTS idx_sms_log_order_id   ON sms_log (order_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_event       ON sms_log (event);
CREATE INDEX IF NOT EXISTS idx_sms_log_twilio_sid  ON sms_log (twilio_sid) WHERE twilio_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_log_created_at  ON sms_log (created_at DESC);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

-- No public access — service_role bypasses RLS automatically
CREATE POLICY "sms_log_deny_public" ON sms_log FOR ALL TO public USING (FALSE);

CREATE TABLE IF NOT EXISTS sms_verify_attempts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_verify_phone_hash
  ON sms_verify_attempts (phone_hash, created_at DESC);

ALTER TABLE sms_verify_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_verify_deny_public" ON sms_verify_attempts FOR ALL TO public USING (FALSE);


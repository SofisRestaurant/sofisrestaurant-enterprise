-- =============================================================================
-- LOYALTY V2 — FILE 2: LEDGER
-- =============================================================================
-- The immutable append-only financial record. Every point movement ever.
-- This is the single source of truth for all balances.
--
-- Design principles:
--   - Rows are NEVER updated or deleted (enforced by triggers at DB level)
--   - Every row has a signed amount (positive=earn, negative=redeem/adjust)
--   - Every row knows the account balance after this entry (snapshot)
--   - Every row carries enough context to reconstruct intent without joins
--   - Idempotency key (idempotency_key) prevents duplicate business events
--
-- Transaction types:
--   earn        — points awarded for a purchase
--   redemption  — points spent by customer
--   adjustment  — manual admin correction or system reversal
--   expiry      — future: points expired after inactivity (not yet used)
--
-- Relationship to v1:
--   loyalty_transactions (v1) remains untouched — it is historical record.
--   All new activity writes to this table only.
--   Migration script (file 3) will copy v1 history into this ledger.
-- =============================================================================

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  -- Identity
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid        NOT NULL REFERENCES loyalty_accounts (id) ON DELETE RESTRICT,

  -- The financial entry
  amount          integer     NOT NULL,   -- signed: positive=earn, negative=spend
  CHECK (amount <> 0),                   -- zero-amount entries are meaningless

  -- Running balance snapshot at time of this entry
  -- Redundant with SUM() but allows fast point-in-time queries without full scan
  balance_after   integer     NOT NULL CHECK (balance_after >= 0),

  -- Categorisation
  entry_type      text        NOT NULL
                              CHECK (entry_type IN ('earn', 'redemption', 'adjustment', 'expiry')),

  -- Source context (enough to reconstruct without joins)
  source          text        NOT NULL,   -- 'admin_scan' | 'online_checkout' | 'system' | 'migration'
  reference_id    uuid,                  -- order_id, checkout_session_id, etc.
  admin_id        uuid        REFERENCES profiles (id) ON DELETE SET NULL,

  -- Idempotency: prevents double-processing the same business event
  -- Format: '<source>:<reference_id>' e.g. 'admin_scan:order-uuid'
  -- NULL allowed for events with no natural idempotency key (e.g. manual adjustments)
  idempotency_key text,

  -- Audit snapshot (denormalised for forensic reads — no joins needed)
  tier_at_time    text        NOT NULL DEFAULT 'bronze',
  streak_at_time  integer     NOT NULL DEFAULT 0,
  metadata        jsonb       NOT NULL DEFAULT '{}',

  -- Timestamp (immutable — no updated_at)
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Idempotency constraint ────────────────────────────────────────────────────
-- Partial unique index: only enforced when idempotency_key is not null.
-- This prevents duplicate business events (double-scan, retry, etc.)
-- while allowing multiple manual adjustments with no natural key.
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_idempotency_idx
  ON loyalty_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX loyalty_ledger_idempotency_idx IS
  'Prevents duplicate business events. Partial — NULL keys are unrestricted.';

-- ── Query indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS loyalty_ledger_account_id_idx
  ON loyalty_ledger (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS loyalty_ledger_reference_id_idx
  ON loyalty_ledger (reference_id)
  WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS loyalty_ledger_admin_id_idx
  ON loyalty_ledger (admin_id)
  WHERE admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS loyalty_ledger_entry_type_idx
  ON loyalty_ledger (entry_type, created_at DESC);

-- ── Immutability enforcement ──────────────────────────────────────────────────
-- Triggers fire for ALL roles including service_role.
-- There is no way to modify or delete a ledger row from any context.

CREATE OR REPLACE FUNCTION loyalty_ledger_prevent_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RAISE EXCEPTION
    'loyalty_ledger is append-only. Row % cannot be modified.',
    OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION loyalty_ledger_prevent_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RAISE EXCEPTION
    'loyalty_ledger is append-only. Row % cannot be deleted.',
    OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_ledger_no_update ON loyalty_ledger;
CREATE TRIGGER trg_loyalty_ledger_no_update
  BEFORE UPDATE ON loyalty_ledger
  FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_prevent_update();

DROP TRIGGER IF EXISTS trg_loyalty_ledger_no_delete ON loyalty_ledger;
CREATE TRIGGER trg_loyalty_ledger_no_delete
  BEFORE DELETE ON loyalty_ledger
  FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_prevent_delete();

-- ── Cache sync trigger ────────────────────────────────────────────────────────
-- After every INSERT, recompute the account's cached balance + lifetime_earned
-- from the ledger. Never call directly — fires automatically.
-- The award/redeem RPCs (files 5 + 6) rely on this to keep accounts in sync.

CREATE OR REPLACE FUNCTION loyalty_ledger_sync_account_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE loyalty_accounts
  SET
    balance         = (
      SELECT COALESCE(SUM(amount), 0)
      FROM loyalty_ledger
      WHERE account_id = NEW.account_id
    ),
    lifetime_earned = (
      SELECT COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)
      FROM loyalty_ledger
      WHERE account_id = NEW.account_id
    )
  WHERE id = NEW.account_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_ledger_sync_balance ON loyalty_ledger;
CREATE TRIGGER trg_loyalty_ledger_sync_balance
  AFTER INSERT ON loyalty_ledger
  FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_sync_account_balance();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own ledger entries (via account join)
CREATE POLICY "loyalty_ledger: users read own"
  ON loyalty_ledger FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT id FROM loyalty_accounts WHERE user_id = auth.uid()
    )
  );

-- No client writes — ever
CREATE POLICY "loyalty_ledger: deny all authenticated writes"
  ON loyalty_ledger FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "loyalty_ledger: service role full access"
  ON loyalty_ledger FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE loyalty_ledger IS
  'Immutable append-only financial ledger. Every point movement lives here. '
  'balance_after is a snapshot for forensic queries. '
  'loyalty_accounts.balance is the cached live total, maintained by trigger. '
  'NEVER write to this table from application code — use award/redeem RPCs only.';
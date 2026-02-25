-- =============================================================================
-- LOYALTY V2 — FILE 1: ACCOUNTS
-- =============================================================================
-- One account per user. The account is the financial identity for loyalty.
-- Separates loyalty state from the profiles table entirely — profiles owns
-- user metadata (name, role, phone); loyalty_accounts owns financial state.
--
-- Why a separate table?
--   - profiles grows with features; loyalty shouldn't inherit that coupling
--   - loyalty_accounts can have its own RLS, backup policy, and audit scope
--   - future: multi-account (e.g. family sharing) without touching profiles
--
-- Phase 1 scope: create table + RLS + indexes.
-- Balance columns are cached projections — source of truth is loyalty_ledger.
-- =============================================================================

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  -- Identity
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,

  -- Cached balance projections (maintained by trigger, never written by app code)
  -- Source of truth: SUM(loyalty_ledger.amount) WHERE account_id = this.id
  balance       integer     NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned integer   NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),

  -- Tier (computed from lifetime_earned by trigger — not set by app code)
  tier          text        NOT NULL DEFAULT 'bronze'
                            CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),

  -- Streak (game mechanic — updated by award RPC)
  streak        integer     NOT NULL DEFAULT 0 CHECK (streak >= 0),
  last_activity date,

  -- Lifecycle
  status        text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'suspended', 'closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One account per user (enforced at DB level)
  CONSTRAINT loyalty_accounts_user_unique UNIQUE (user_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS loyalty_accounts_user_id_idx
  ON loyalty_accounts (user_id);

CREATE INDEX IF NOT EXISTS loyalty_accounts_tier_idx
  ON loyalty_accounts (tier, lifetime_earned DESC);

-- ── Updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION loyalty_accounts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_accounts_updated_at ON loyalty_accounts;
CREATE TRIGGER trg_loyalty_accounts_updated_at
  BEFORE UPDATE ON loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION loyalty_accounts_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;

-- Users can read their own account
CREATE POLICY "loyalty_accounts: users read own"
  ON loyalty_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No direct writes from any client — service role only (via Edge Functions + RPCs)
CREATE POLICY "loyalty_accounts: deny authenticated insert"
  ON loyalty_accounts FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "loyalty_accounts: deny authenticated update"
  ON loyalty_accounts FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "loyalty_accounts: deny authenticated delete"
  ON loyalty_accounts FOR DELETE TO authenticated
  USING (false);

-- Service role has full access (bypasses RLS — needed by Edge Functions and RPCs)
CREATE POLICY "loyalty_accounts: service role full access"
  ON loyalty_accounts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE loyalty_accounts IS
  'One account per user. balance and lifetime_earned are trigger-maintained caches. '
  'Source of truth is loyalty_ledger. Never write balance directly from application code.';
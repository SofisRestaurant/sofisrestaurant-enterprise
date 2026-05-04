-- =============================================================================
-- 202602270002_auth_audit_log.sql
-- Immutable auth event log — append-only, no client reads via REST
-- =============================================================================
-- Design principles:
--   • Append-only. Triggers block UPDATE and DELETE.
--   • No client reads — only service_role and admin-privileged functions.
--   • Mirrors the pattern of loyalty_ledger (immutable financial ledger).
--   • IP and user_agent stored for forensic use, never exposed to clients.
--   • event_data is JSONB — extensible without schema changes.
-- =============================================================================

CREATE TYPE public.auth_event_type AS ENUM (
  'login_success',
  'login_failure',
  'logout',
  'signup',
  'password_reset_request',
  'password_reset_complete',
  'magic_link_sent',
  'magic_link_used',
  'device_trust_granted',
  'device_trust_revoked',
  'session_refreshed',
  'session_revoked',
  'mfa_challenge',
  'mfa_success',
  'mfa_failure',
  'account_locked',
  'account_unlocked',
  'suspicious_activity'
);

CREATE TABLE public.auth_audit_log (
  id              uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid              REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type      auth_event_type   NOT NULL,
  ip_address      text,
  user_agent_hash text,             -- hashed, not raw
  device_id       uuid              REFERENCES public.device_trust(id) ON DELETE SET NULL,
  risk_score      smallint          CHECK (risk_score BETWEEN 0 AND 100),
  event_data      jsonb             NOT NULL DEFAULT '{}',
  created_at      timestamptz       NOT NULL DEFAULT now(),

  -- Prevent bloated event_data
  CONSTRAINT auth_audit_event_data_size CHECK (octet_length(event_data::text) < 4096)
);

-- Partitioned by month for efficient archival (optional — comment out if not needed)
-- CREATE INDEX auth_audit_log_created_idx ON public.auth_audit_log (created_at DESC);
CREATE INDEX auth_audit_log_user_idx     ON public.auth_audit_log (user_id, created_at DESC);
CREATE INDEX auth_audit_log_event_idx    ON public.auth_audit_log (event_type, created_at DESC);
CREATE INDEX auth_audit_log_ip_idx       ON public.auth_audit_log (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

-- ── Immutability triggers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_audit_log_prevent_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'auth_audit_log rows are immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_audit_log_prevent_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'auth_audit_log rows cannot be deleted';
END;
$$;

CREATE TRIGGER auth_audit_log_no_update
  BEFORE UPDATE ON public.auth_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.auth_audit_log_prevent_update();

CREATE TRIGGER auth_audit_log_no_delete
  BEFORE DELETE ON public.auth_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.auth_audit_log_prevent_delete();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.auth_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_log FORCE ROW LEVEL SECURITY;

-- No client reads via REST API — logs are sensitive forensic data
CREATE POLICY "auth_audit_log: deny all authenticated"
  ON public.auth_audit_log FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "auth_audit_log: deny all anon"
  ON public.auth_audit_log FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Service role only (edge functions)
CREATE POLICY "auth_audit_log: service role full access"
  ON public.auth_audit_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Revoke all client access at privilege level too ───────────────────────────
REVOKE ALL ON public.auth_audit_log FROM anon, authenticated;
GRANT INSERT ON public.auth_audit_log TO service_role;  -- INSERT only; triggers block rest
-- =============================================================================
-- 202602270001_auth_device_trust.sql
-- Device trust registry — one row per user+device pair
-- =============================================================================
-- Design principles:
--   • Fingerprint is stored as SHA-256 hash — raw fingerprint never hits DB
--   • Trust is permanent (INSERT only). Revocation is service-role-only DELETE.
--   • No UPDATE — trust state is binary: exists or doesn't
--   • FORCE ROW LEVEL SECURITY so postgres superuser also respects policies
-- =============================================================================

CREATE TABLE public.device_trust (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint_hash  text        NOT NULL,           -- SHA-256 of client fingerprint
  user_agent_hash   text,                           -- SHA-256 of user agent string
  trusted_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  trust_label       text,                           -- e.g. "Chrome on Mac"
  ip_at_trust       text,                           -- IP when trust was granted (for audit)
  is_revoked        boolean     NOT NULL DEFAULT false,

  CONSTRAINT device_trust_fingerprint_check CHECK (length(fingerprint_hash) = 64),
  CONSTRAINT device_trust_unique_per_user UNIQUE (user_id, fingerprint_hash)
);

-- Index for the hot path: "does this user trust this fingerprint?"
CREATE INDEX device_trust_lookup_idx
  ON public.device_trust (user_id, fingerprint_hash)
  WHERE is_revoked = false;

-- Index for admin queries: all trusted devices for a user
CREATE INDEX device_trust_user_idx
  ON public.device_trust (user_id, trusted_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.device_trust ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_trust FORCE ROW LEVEL SECURITY;

-- Users can see their own trusted devices (for account management UI)
CREATE POLICY "device_trust: users read own"
  ON public.device_trust FOR SELECT
  TO authenticated
  USING (user_id = ( SELECT auth.uid()));

-- Users cannot insert trust directly — only the edge function (service_role) can
CREATE POLICY "device_trust: deny authenticated insert"
  ON public.device_trust FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- No updates via client ever
CREATE POLICY "device_trust: deny authenticated update"
  ON public.device_trust FOR UPDATE
  TO authenticated
  USING (false);

-- No deletes via client — revocation is service_role only
CREATE POLICY "device_trust: deny authenticated delete"
  ON public.device_trust FOR DELETE
  TO authenticated
  USING (false);

-- Service role has full access (edge functions use service role)
CREATE POLICY "device_trust: service role full access"
  ON public.device_trust FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Revoke default ACL inherited from schema default ──────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.device_trust FROM anon, authenticated;
GRANT SELECT ON public.device_trust TO authenticated;   -- RLS filters to own rows only
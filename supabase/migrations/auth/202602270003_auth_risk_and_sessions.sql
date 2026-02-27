-- =============================================================================
-- 202602270003_auth_risk_and_sessions.sql
-- Risk score cache + extended session metadata
-- =============================================================================

-- ── auth_risk_scores ──────────────────────────────────────────────────────────
-- Stores the last computed risk evaluation per user session.
-- Written by auth-risk-evaluation edge function (service role).
-- Read by client to determine if additional friction is needed.
-- TTL: rows expire after 1 hour — cron cleanup handles old rows.

CREATE TABLE public.auth_risk_scores (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id          text        NOT NULL,           -- Supabase session ID
  risk_score          smallint    NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),

  -- Score breakdown (for audit transparency, not exposed to client)
  device_unknown_pts  smallint    NOT NULL DEFAULT 0,
  geo_mismatch_pts    smallint    NOT NULL DEFAULT 0,
  rapid_attempts_pts  smallint    NOT NULL DEFAULT 0,
  unusual_time_pts    smallint    NOT NULL DEFAULT 0,
  pw_mismatch_pts     smallint    NOT NULL DEFAULT 0,

  requires_device_trust   boolean NOT NULL DEFAULT false,
  requires_mfa            boolean NOT NULL DEFAULT false,
  requires_step_up        boolean NOT NULL DEFAULT false,

  evaluated_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),

  CONSTRAINT auth_risk_one_per_session UNIQUE (session_id)
);

CREATE INDEX auth_risk_user_idx    ON public.auth_risk_scores (user_id, evaluated_at DESC);
CREATE INDEX auth_risk_expiry_idx  ON public.auth_risk_scores (expires_at)
  WHERE expires_at < now();   -- for cleanup cron

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.auth_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_risk_scores FORCE ROW LEVEL SECURITY;

-- Users can read their own risk score (client uses this to decide if friction is needed)
-- BUT: only the score + requires_* fields should be exposed via SELECT in the app
-- The breakdown columns are never selected by client queries
CREATE POLICY "auth_risk_scores: users read own"
  ON public.auth_risk_scores FOR SELECT
  TO authenticated
  USING (user_id = ( SELECT auth.uid()));

-- No client writes — risk scores are server-computed only
CREATE POLICY "auth_risk_scores: deny authenticated writes"
  ON public.auth_risk_scores FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "auth_risk_scores: deny authenticated updates"
  ON public.auth_risk_scores FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "auth_risk_scores: deny authenticated deletes"
  ON public.auth_risk_scores FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "auth_risk_scores: service role full access"
  ON public.auth_risk_scores FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.auth_risk_scores FROM anon, authenticated;
GRANT SELECT ON public.auth_risk_scores TO authenticated;


-- ── auth_sessions_meta ────────────────────────────────────────────────────────
-- Extended metadata per session — geo, device_id, trust state.
-- Supplements Supabase's auth.sessions table (which we can't modify).

CREATE TABLE public.auth_sessions_meta (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id          text        NOT NULL,
  device_trust_id     uuid        REFERENCES public.device_trust(id) ON DELETE SET NULL,
  ip_address          text,
  country_code        char(2),
  city                text,
  is_trusted_device   boolean     NOT NULL DEFAULT false,
  risk_score          smallint    CHECK (risk_score BETWEEN 0 AND 100),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_active_at      timestamptz NOT NULL DEFAULT now(),
  invalidated_at      timestamptz,
  invalidation_reason text,

  CONSTRAINT auth_sessions_meta_unique UNIQUE (session_id)
);

CREATE INDEX auth_sessions_meta_user_idx
  ON public.auth_sessions_meta (user_id, last_active_at DESC);

CREATE INDEX auth_sessions_meta_active_idx
  ON public.auth_sessions_meta (user_id)
  WHERE invalidated_at IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.auth_sessions_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions_meta FORCE ROW LEVEL SECURITY;

-- Users can see their own sessions (for "active sessions" account page)
CREATE POLICY "auth_sessions_meta: users read own"
  ON public.auth_sessions_meta FOR SELECT
  TO authenticated
  USING (user_id = ( SELECT auth.uid()));

-- No direct client writes
CREATE POLICY "auth_sessions_meta: deny authenticated writes"
  ON public.auth_sessions_meta FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "auth_sessions_meta: deny authenticated updates"
  ON public.auth_sessions_meta FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "auth_sessions_meta: deny authenticated deletes"
  ON public.auth_sessions_meta FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "auth_sessions_meta: service role full access"
  ON public.auth_sessions_meta FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.auth_sessions_meta FROM anon, authenticated;
GRANT SELECT ON public.auth_sessions_meta TO authenticated;


-- ── Cleanup cron (register in supabase/cron/) ─────────────────────────────────
-- DELETE FROM public.auth_risk_scores WHERE expires_at < now();
-- DELETE FROM public.auth_sessions_meta
--   WHERE invalidated_at IS NOT NULL AND invalidated_at < now() - interval '90 days';
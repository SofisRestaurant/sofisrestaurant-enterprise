-- =============================================================================
-- 202602270004_auth_cleanup_cron.sql
-- Scheduled cleanup for auth tables with TTL semantics
-- Register these in supabase/cron/ or via Supabase dashboard → Cron Jobs
-- =============================================================================

-- ── Cleanup expired risk scores (hourly) ─────────────────────────────────────
-- Risk scores expire after 1 hour. Clean up hourly to keep the table lean.
SELECT cron.schedule(
  'cleanup-expired-risk-scores',
  '0 * * * *',  -- every hour at :00
  $$
    DELETE FROM public.auth_risk_scores
    WHERE expires_at < now();
  $$
);

-- ── Cleanup old invalidated session meta (weekly) ─────────────────────────────
-- Keep invalidated sessions for 90 days for forensics, then purge.
SELECT cron.schedule(
  'cleanup-old-auth-sessions',
  '0 3 * * 0',  -- every Sunday at 03:00 UTC
  $$
    DELETE FROM public.auth_sessions_meta
    WHERE invalidated_at IS NOT NULL
      AND invalidated_at < now() - interval '90 days';
  $$
);

-- ── Audit log archival boundary (no delete — logs are immutable) ─────────────
-- auth_audit_log rows CANNOT be deleted (triggers block it).
-- For long-term storage, consider Postgres logical replication to cold storage
-- after 1 year. The table should be monitored for size.

-- ── Helpful view: recent auth events for admin dashboard ─────────────────────
-- This view is admin-only via the edge function — NOT exposed via REST
CREATE OR REPLACE VIEW public.v_recent_auth_events AS
SELECT
  al.id,
  al.event_type,
  al.risk_score,
  al.created_at,
  -- Redact user identity for non-admin contexts
  -- Full user_id available to service_role queries only
  left(al.user_id::text, 8) || '...' AS user_id_redacted,
  al.event_data - 'email' - 'raw_ua' AS safe_event_data
FROM public.auth_audit_log al
ORDER BY al.created_at DESC;

-- Restrict this view to service_role only
REVOKE ALL ON public.v_recent_auth_events FROM anon, authenticated;
GRANT SELECT ON public.v_recent_auth_events TO service_role;
-- =============================================================================
-- Migration: Guest Rate Limiting System
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.guest_rate_limits (
  ip_hash          TEXT PRIMARY KEY CHECK (char_length(ip_hash) = 64),
  request_count    INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  window_start     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overrun_count    INTEGER NOT NULL DEFAULT 0 CHECK (overrun_count >= 0),
  blocked_until    TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_rate_limits_blocked_until
  ON public.guest_rate_limits (blocked_until)
  WHERE blocked_until IS NOT NULL;

ALTER TABLE public.guest_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guest_rate_limits'
      AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only
      ON public.guest_rate_limits
      AS RESTRICTIVE
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- ─── atomic rate limit function ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_guest_rate_limit(
  p_ip_hash           TEXT,
  p_window_ms         BIGINT  DEFAULT 900000,
  p_max_requests      INTEGER DEFAULT 20,
  p_block_duration_ms BIGINT  DEFAULT 1800000,
  p_overrun_limit     INTEGER DEFAULT 3
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  retry_after_ms bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec           guest_rate_limits%ROWTYPE;
  v_now           TIMESTAMPTZ := clock_timestamp();
  v_window_cutoff TIMESTAMPTZ := v_now - (p_window_ms * INTERVAL '1 millisecond');
  v_retry_ms      BIGINT;
  v_new_count     INTEGER;
BEGIN
  SELECT * INTO v_rec
  FROM guest_rate_limits
  WHERE ip_hash = p_ip_hash
  FOR UPDATE;

  -- ─── first request ─────────────────────────────────────────────
  IF NOT FOUND THEN
    INSERT INTO guest_rate_limits
      (ip_hash, request_count, window_start, overrun_count, updated_at)
    VALUES
      (p_ip_hash, 1, v_now, 0, v_now);

    RETURN QUERY SELECT true, '', 0;
  END IF;

  -- ─── blocked state ─────────────────────────────────────────────
  IF v_rec.blocked_until IS NOT NULL AND v_rec.blocked_until > v_now THEN
    v_retry_ms := EXTRACT(EPOCH FROM (v_rec.blocked_until - v_now))::BIGINT * 1000;

    RETURN QUERY SELECT false, 'ip_blocked', v_retry_ms;
  END IF;

  -- ─── reset window ─────────────────────────────────────────────
  IF v_rec.window_start < v_window_cutoff THEN
    UPDATE guest_rate_limits
    SET request_count = 1,
        window_start = v_now,
        blocked_until = NULL,
        updated_at = v_now
    WHERE ip_hash = p_ip_hash;

    RETURN QUERY SELECT true, '', 0;
  END IF;

  -- ─── increment counter ─────────────────────────────────────────
  v_new_count := v_rec.request_count + 1;

  IF v_new_count > p_max_requests THEN

    IF v_rec.overrun_count + 1 >= p_overrun_limit THEN
      UPDATE guest_rate_limits
      SET request_count = v_new_count,
          overrun_count = v_rec.overrun_count + 1,
          blocked_until = v_now + (p_block_duration_ms * INTERVAL '1 millisecond'),
          updated_at = v_now
      WHERE ip_hash = p_ip_hash;

      v_retry_ms := p_block_duration_ms;

    ELSE
      UPDATE guest_rate_limits
      SET request_count = v_new_count,
          overrun_count = v_rec.overrun_count + 1,
          updated_at = v_now
      WHERE ip_hash = p_ip_hash;

      v_retry_ms := EXTRACT(EPOCH FROM (
        v_rec.window_start + (p_window_ms * INTERVAL '1 millisecond') - v_now
      ))::BIGINT * 1000;
    END IF;

    RETURN QUERY SELECT false, 'rate_limit_exceeded', GREATEST(v_retry_ms, 0);
  END IF;

  -- ─── normal request ────────────────────────────────────────────
  UPDATE guest_rate_limits
  SET request_count = v_new_count,
      updated_at = v_now
  WHERE ip_hash = p_ip_hash;

  RETURN QUERY SELECT true, '', 0;
END;
$$;

-- ─── cleanup function ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prune_guest_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM guest_rate_limits
  WHERE updated_at < NOW() - INTERVAL '2 hours'
    AND (blocked_until IS NULL OR blocked_until < NOW());

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
-- =============================================================================
-- Migration: 20260519120000_create_restaurant_ordering_settings
-- Purpose:   Emergency pause switch for Sofi's Restaurant online ordering
-- Phase:     1 — table + seed only (no frontend, no Edge Function changes)
-- Idempotent: safe to re-run
-- =============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.restaurant_ordering_settings (
  id                      text        PRIMARY KEY DEFAULT 'default',
  online_ordering_enabled boolean     NOT NULL DEFAULT true,
  pause_message           text        NOT NULL DEFAULT 'Online ordering is currently paused.',
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Hard constraint: only one row, and its id must be 'default'
  CONSTRAINT restaurant_ordering_settings_singleton CHECK (id = 'default')
);

COMMENT ON TABLE  public.restaurant_ordering_settings IS
  'Emergency pause switch for online ordering. Exactly one row (id = ''default'').';
COMMENT ON COLUMN public.restaurant_ordering_settings.online_ordering_enabled IS
  'false = ordering paused site-wide.';
COMMENT ON COLUMN public.restaurant_ordering_settings.pause_message IS
  'Customer-facing message shown when ordering is paused.';

-- ─────────────────────────────────────────────────────────────
-- 2. updated_at trigger (dedicated to this table)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_restaurant_ordering_settings()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Drop-if-exists keeps the migration idempotent
DROP TRIGGER IF EXISTS trg_set_updated_at ON public.restaurant_ordering_settings;

CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.restaurant_ordering_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_restaurant_ordering_settings();

-- ─────────────────────────────────────────────────────────────
-- 3. RLS — enabled, no public/customer policies
--    Service role bypasses RLS for Edge Function reads.
--    Admin write policy uses existing is_admin() pattern.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.restaurant_ordering_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only write policy (matches project convention from
-- 20260428090000_fix_is_admin_security_definer.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'restaurant_ordering_settings'
      AND policyname = 'admin_update_ordering_settings'
  ) THEN
    EXECUTE format(
      'CREATE POLICY admin_update_ordering_settings ON public.restaurant_ordering_settings '
      'FOR UPDATE USING (public.is_admin(auth.uid())) '
      'WITH CHECK (public.is_admin(auth.uid()))'
    );
  END IF;
END;
$$;

-- No SELECT / INSERT / DELETE policies for anon or authenticated roles.
-- Edge Functions read via service role (bypasses RLS).
-- Admins may update only; row is seeded by migration, never inserted/deleted by users.

-- ─────────────────────────────────────────────────────────────
-- 4. Seed the singleton row (skip if already present)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.restaurant_ordering_settings (id, online_ordering_enabled, pause_message)
VALUES ('default', true, 'Online ordering is currently paused.')
ON CONFLICT (id) DO NOTHING;
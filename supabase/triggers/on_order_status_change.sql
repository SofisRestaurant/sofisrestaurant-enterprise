-- PATH: supabase/triggers/on_order_status_change.sql
-- =============================================================================
-- MIGRATED: replaced app.settings.service_role_key GUC with
-- app.settings.internal_function_key. The send-sms function already validates
-- x-internal-key (INTERNAL_FUNCTION_KEY) before any DB access — this is the
-- correct internal service-to-service auth mechanism. The service role key must
-- never be stored in database GUC settings or injected into HTTP headers from
-- Postgres.
--
-- REQUIRED PREREQUISITE (run once in Supabase SQL editor or migration):
--   ALTER DATABASE postgres
--     SET "app.settings.internal_function_key" = '<your INTERNAL_FUNCTION_KEY value>';
--
-- Or via Supabase CLI:
--   supabase secrets set INTERNAL_FUNCTION_KEY=<value>
--   Then in a migration: SELECT set_config('app.settings.internal_function_key', current_setting('app.settings.internal_function_key'), false);
--
-- The app.settings.service_role_key GUC can be removed from your database
-- config once this migration is applied and verified.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sms_event      TEXT;
  v_supabase_url   TEXT;
  v_internal_key   TEXT;  -- MIGRATED: was v_service_key (service_role_key)
  v_payload        JSONB;
BEGIN

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_sms_event := CASE NEW.status
    WHEN 'confirmed'  THEN 'confirmed'
    WHEN 'preparing'  THEN 'preparing'
    WHEN 'ready'      THEN 'ready'
    WHEN 'delivered'  THEN 'delivered'
    WHEN 'cancelled'  THEN 'cancelled'
    ELSE NULL
  END;

  IF v_sms_event IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_sms_event = 'confirmed' AND OLD.status IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url');
    -- MIGRATED: reads internal_function_key instead of service_role_key.
    -- INTERNAL_FUNCTION_KEY is a shared secret for internal Edge Function calls
    -- only — it does NOT bypass RLS or grant DB access if leaked.
    v_internal_key := current_setting('app.settings.internal_function_key');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_order_status_change: app.settings not configured for order %', NEW.id;
    RETURN NEW;
  END;

  IF NEW.customer_phone IS NULL OR NEW.customer_phone = '' THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'order_id', NEW.id,
    'event',    v_sms_event
  );

  PERFORM extensions.http_post(
    url     := v_supabase_url || '/functions/v1/send-sms',
    body    := v_payload::text,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      -- MIGRATED: x-internal-key replaces Authorization: Bearer <service_role_key>.
      -- send-sms validates this header before any DB access (see send-sms/index.ts §1).
      'x-internal-key', v_internal_key
    )
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never fail the UPDATE due to SMS issues
  RAISE WARNING 'notify_order_status_change: SMS trigger failed for order % — %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_status_change ON orders;

CREATE TRIGGER on_order_status_change
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_order_status_change();

GRANT EXECUTE ON FUNCTION notify_order_status_change() TO service_role;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sms_event   TEXT;
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_payload      JSONB;
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
    v_service_key  := current_setting('app.settings.service_role_key');
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
      'Authorization', 'Bearer ' || v_service_key
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
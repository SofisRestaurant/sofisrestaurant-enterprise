CREATE OR REPLACE FUNCTION handle_order_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    -- Update order timestamp
    NEW.updated_at = NOW();
    
    -- Here you could trigger notifications, emails, etc.
    -- For now, just log the event
    INSERT INTO audit.events (event_type, entity_id, details)
    VALUES ('order_paid', NEW.id, jsonb_build_object(
      'amount', NEW.amount,
      'customer_email', NEW.customer_email
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_status_changed
  BEFORE UPDATE ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION handle_order_paid();

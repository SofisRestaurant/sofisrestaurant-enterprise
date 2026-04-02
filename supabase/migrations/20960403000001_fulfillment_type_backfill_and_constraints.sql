
BEGIN;


UPDATE public.orders
SET fulfillment_type = CASE
  WHEN fulfillment_type IS NOT NULL THEN fulfillment_type

  ELSE 'pickup'
END
WHERE fulfillment_type IS NULL;


DO $$
DECLARE
  remaining_nulls INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_nulls
  FROM public.orders
  WHERE fulfillment_type IS NULL;

  IF remaining_nulls > 0 THEN
    RAISE EXCEPTION
      'Backfill incomplete: % rows still have null fulfillment_type. Rolling back.',
      remaining_nulls;
  END IF;

  RAISE NOTICE 'Backfill verified: 0 null fulfillment_type rows remain.';
END $$;


ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_type_check;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fulfillment_type_check;



ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_type_check
  CHECK (fulfillment_type IN ('pickup', 'delivery', 'dine_in'))
  NOT VALID;

ALTER TABLE public.orders
  VALIDATE CONSTRAINT orders_fulfillment_type_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('food', 'merch'))
  NOT VALID;

ALTER TABLE public.orders
  VALIDATE CONSTRAINT orders_order_type_check;


ALTER TABLE public.orders
  ALTER COLUMN fulfillment_type SET NOT NULL;

ALTER TABLE public.orders
  ALTER COLUMN fulfillment_type SET DEFAULT 'pickup';


ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_stripe_session_unique;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_stripe_session_unique
  UNIQUE (stripe_session_id);



CREATE OR REPLACE FUNCTION public.handle_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN

  IF tg_op = 'INSERT' THEN
    INSERT INTO public.order_events (order_id, event_type, event_data, user_id)
    VALUES (
      NEW.id,
      'ORDER_CREATED',
      jsonb_build_object(
        'total',            NEW.amount_total,
        'currency',         NEW.currency,
        'order_type',       NEW.order_type,       -- food | merch
        'fulfillment_type', NEW.fulfillment_type  -- pickup | delivery | dine_in
      ),
      NULL
    );
    RETURN NEW;
  END IF;

  IF tg_op = 'UPDATE' THEN

    -- STATUS CHANGED
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.order_events (order_id, event_type, event_data, user_id)
      VALUES (
        NEW.id,
        'STATUS_CHANGED',
        jsonb_build_object(
          'previous_status', OLD.status,
          'new_status',       NEW.status
        ),
        NULL
      );

      IF NEW.status = 'preparing' THEN
        INSERT INTO public.order_events (order_id, event_type)
        VALUES (NEW.id, 'PREPARING_STARTED');
      END IF;

      IF NEW.status = 'ready' THEN
        INSERT INTO public.order_events (order_id, event_type)
        VALUES (NEW.id, 'READY_FOR_PICKUP');
      END IF;

      IF NEW.status = 'completed' THEN
        INSERT INTO public.order_events (order_id, event_type)
        VALUES (NEW.id, 'COMPLETED');
      END IF;

      IF NEW.status = 'cancelled' THEN
        INSERT INTO public.order_events (order_id, event_type)
        VALUES (NEW.id, 'ORDER_CANCELLED');
      END IF;
    END IF;

    -- STAFF ASSIGNED
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       AND NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.order_events (order_id, event_type, event_data)
      VALUES (
        NEW.id,
        'COOK_ASSIGNED',
        jsonb_build_object('assigned_to', NEW.assigned_to)
      );
    END IF;

    IF NEW.notes IS DISTINCT FROM OLD.notes
       AND NEW.notes IS NOT NULL THEN
      INSERT INTO public.order_events (order_id, event_type, event_data)
      VALUES (
        NEW.id,
        'NOTE_ADDED',
        jsonb_build_object('note', NEW.notes)
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- ── Step 8: Indexes ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_type
  ON public.orders (fulfillment_type);

CREATE INDEX IF NOT EXISTS idx_orders_order_type
  ON public.orders (order_type);

-- Kitchen/expo hot path: active orders by fulfillment type
CREATE INDEX IF NOT EXISTS idx_orders_status_fulfillment
  ON public.orders (status, fulfillment_type)
  WHERE status IN ('confirmed', 'preparing', 'ready');


DROP VIEW IF EXISTS public.order_timeline;

CREATE VIEW public.order_timeline AS
SELECT
  o.id              AS order_id,
  o.order_number,
  o.status          AS current_status,
  o.order_type,
  o.fulfillment_type,
  o.amount_total,
  o.customer_uid,
  oe.id             AS event_id,
  oe.event_type,
  oe.event_data,
  oe.user_id,
  oe.created_at     AS event_time
FROM public.orders o
LEFT JOIN public.order_events oe ON oe.order_id = o.id
ORDER BY o.created_at DESC, oe.created_at;

-- ── Step 10: Column comments ──────────────────────────────────────────────

COMMENT ON COLUMN public.orders.order_type IS
  'WHAT is being sold: food | merch. Never a fulfillment method.';

COMMENT ON COLUMN public.orders.fulfillment_type IS
  'HOW the order is delivered: pickup | delivery | dine_in. Never an order category.';

COMMIT;

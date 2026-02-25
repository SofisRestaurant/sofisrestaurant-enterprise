-- ============================================================================
-- 🏗 ENTERPRISE ORDER SYSTEM UPGRADE
-- Adds operational columns required for kitchen, expo, dispatch & analytics
-- ============================================================================

-- ============================================================================
-- ORDER NUMBER (human friendly)
-- ============================================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS order_number BIGINT;

-- Optional uniqueness (safe if null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number
ON public.orders(order_number)
WHERE order_number IS NOT NULL;

-- ============================================================================
-- FULFILLMENT
-- ============================================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS fulfillment_type TEXT DEFAULT 'pickup'
CHECK (fulfillment_type IN ('pickup', 'delivery', 'dine_in'));

-- ============================================================================
-- READY TIMES
-- ============================================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS estimated_ready_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_ready_time TIMESTAMPTZ;

-- ============================================================================
-- STAFF ASSIGNMENT
-- ============================================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS assigned_cook TEXT,
ADD COLUMN IF NOT EXISTS assigned_driver TEXT;

-- ============================================================================
-- MULTI LOCATION (future proof)
-- ============================================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS location_id UUID;

-- ============================================================================
-- AUTO UPDATE timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_order_updated_at ON public.orders;

CREATE TRIGGER trg_touch_order_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.touch_order_updated_at();

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_type
ON public.orders(fulfillment_type);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_cook
ON public.orders(assigned_cook);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_driver
ON public.orders(assigned_driver);

CREATE INDEX IF NOT EXISTS idx_orders_location_id
ON public.orders(location_id);

CREATE INDEX IF NOT EXISTS idx_orders_estimated_ready_time
ON public.orders(estimated_ready_time);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.orders.order_number IS 'Human readable number for TVs, SMS, receipts';
COMMENT ON COLUMN public.orders.fulfillment_type IS 'pickup | delivery | dine_in';
COMMENT ON COLUMN public.orders.assigned_cook IS 'Name or ID of cook responsible';
COMMENT ON COLUMN public.orders.assigned_driver IS 'Driver assigned for delivery';
COMMENT ON COLUMN public.orders.location_id IS 'For multi-location scaling';
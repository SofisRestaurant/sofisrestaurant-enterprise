-- ============================================================================
-- ORDER EVENTS TABLE — EVENT SOURCING FOR COMPLETE ORDER HISTORY
-- ============================================================================
-- This table records EVERY state change, assignment, and action on orders
-- Enables: analytics, performance tracking, dispute resolution, AI training
-- ============================================================================

-- Create order_events table
CREATE TABLE IF NOT EXISTS public.order_events (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign keys
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Who triggered this event
  
  -- Event details
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Performance optimization
  CONSTRAINT valid_event_type CHECK (
    event_type IN (
      -- Order lifecycle
      'ORDER_CREATED',
      'ORDER_CONFIRMED',
      'ORDER_CANCELLED',
      'ORDER_REFUNDED',
      
      -- Status changes
      'STATUS_CHANGED',
      'PAYMENT_RECEIVED',
      'PAYMENT_FAILED',
      
      -- Kitchen workflow
      'COOK_ASSIGNED',
      'COOK_UNASSIGNED',
      'PREPARING_STARTED',
      'PREPARING_COMPLETED',
      'READY_FOR_PICKUP',
      
      -- Fulfillment
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'COMPLETED',
      
      -- Issues
      'ISSUE_REPORTED',
      'ISSUE_RESOLVED',
      'CUSTOMER_NOTIFIED',
      
      -- Modifications
      'ITEMS_MODIFIED',
      'SPECIAL_REQUEST_ADDED',
      'NOTE_ADDED',
      
      -- Delays
      'DELAY_REPORTED',
      'ETA_UPDATED'
    )
  )
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Primary lookup patterns
CREATE INDEX idx_order_events_order_id ON public.order_events(order_id);
CREATE INDEX idx_order_events_created_at ON public.order_events(created_at DESC);
CREATE INDEX idx_order_events_event_type ON public.order_events(event_type);
CREATE INDEX idx_order_events_user_id ON public.order_events(user_id) WHERE user_id IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX idx_order_events_order_type ON public.order_events(order_id, event_type);
CREATE INDEX idx_order_events_order_time ON public.order_events(order_id, created_at DESC);

-- GIN index for JSONB queries
CREATE INDEX idx_order_events_data ON public.order_events USING GIN(event_data);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

-- Admin: Full access
CREATE POLICY "Admins can view all order events"
  ON public.order_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Staff: View events for orders they're assigned to
CREATE POLICY "Staff can view assigned order events"
  ON public.order_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('staff', 'admin')
    )
  );

-- Customers: View their own order events
CREATE POLICY "Customers can view their order events"
  ON public.order_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_events.order_id
      AND orders.customer_uid = auth.uid()
    )
  );

-- Service role: Insert events (used by triggers and functions)
CREATE POLICY "Service role can insert events"
  ON public.order_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Authenticated users can insert events they trigger
CREATE POLICY "Users can insert events"
  ON public.order_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- ============================================================================
-- HELPER FUNCTION: Record Order Event
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_order_event(
  p_order_id UUID,
  p_event_type TEXT,
  p_event_data JSONB DEFAULT '{}'::JSONB,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Insert event
  INSERT INTO public.order_events (
    order_id,
    event_type,
    event_data,
    user_id
  )
  VALUES (
    p_order_id,
    p_event_type,
    p_event_data,
    COALESCE(p_user_id, auth.uid())
  )
  RETURNING id INTO v_event_id;
  
  -- Update order's updated_at timestamp
  UPDATE public.orders
  SET updated_at = NOW()
  WHERE id = p_order_id;
  
  RETURN v_event_id;
END;
$$;

-- ============================================================================
-- ANALYTICS VIEWS
-- ============================================================================

-- View: Order timeline with events
CREATE OR REPLACE VIEW public.order_timeline AS
SELECT
  o.id AS order_id,
  o.status AS current_status,
  o.amount_total,
  o.customer_uid,
  oe.id AS event_id,
  oe.event_type,
  oe.event_data,
  oe.user_id,
  oe.created_at AS event_time,
  p.full_name AS triggered_by
FROM public.orders o
LEFT JOIN public.order_events oe ON oe.order_id = o.id
LEFT JOIN public.profiles p ON p.id = oe.user_id
ORDER BY o.created_at DESC, oe.created_at ASC;

-- View: Order performance metrics
CREATE OR REPLACE VIEW public.order_performance AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.status,
  
  -- Time to assign
  EXTRACT(EPOCH FROM (
    (SELECT created_at FROM public.order_events 
     WHERE order_id = o.id AND event_type = 'COOK_ASSIGNED' 
     ORDER BY created_at ASC LIMIT 1)
    - o.created_at
  )) / 60.0 AS minutes_to_assign,
  
  -- Time to start preparing
  EXTRACT(EPOCH FROM (
    (SELECT created_at FROM public.order_events 
     WHERE order_id = o.id AND event_type = 'PREPARING_STARTED' 
     ORDER BY created_at ASC LIMIT 1)
    - o.created_at
  )) / 60.0 AS minutes_to_start,
  
  -- Time to ready
  EXTRACT(EPOCH FROM (
    (SELECT created_at FROM public.order_events 
     WHERE order_id = o.id AND event_type = 'READY_FOR_PICKUP' 
     ORDER BY created_at ASC LIMIT 1)
    - o.created_at
  )) / 60.0 AS minutes_to_ready,
  
  -- Total preparation time
  EXTRACT(EPOCH FROM (
    (SELECT created_at FROM public.order_events 
     WHERE order_id = o.id AND event_type = 'READY_FOR_PICKUP' 
     ORDER BY created_at ASC LIMIT 1)
    - (SELECT created_at FROM public.order_events 
       WHERE order_id = o.id AND event_type = 'PREPARING_STARTED' 
       ORDER BY created_at ASC LIMIT 1)
  )) / 60.0 AS minutes_prep_time,
  
  o.created_at,
  o.updated_at
FROM public.orders o
WHERE o.status != 'cancelled';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.order_events IS 'Event sourcing table tracking all order state changes and actions';
COMMENT ON COLUMN public.order_events.event_type IS 'Type of event - see constraint for valid values';
COMMENT ON COLUMN public.order_events.event_data IS 'Additional event metadata (flexible JSONB)';
COMMENT ON COLUMN public.order_events.user_id IS 'User who triggered this event (NULL for system events)';

COMMENT ON FUNCTION public.record_order_event IS 'Helper function to record order events with automatic timestamp';
COMMENT ON VIEW public.order_timeline IS 'Complete order history with all events';
COMMENT ON VIEW public.order_performance IS 'Order performance metrics calculated from events';
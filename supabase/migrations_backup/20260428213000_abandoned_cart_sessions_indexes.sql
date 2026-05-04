-- Index for threshold filter in fetchAbandonedCarts() and fetchAbandonedCartSummary()
-- Supports: .lt('last_activity', threshold)
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_sessions_last_activity
  ON public.abandoned_cart_sessions (last_activity DESC);

-- Index for summary aggregation filter
-- Supports: filtering recovered = true / false in fetchAbandonedCartSummary()
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_sessions_recovered
  ON public.abandoned_cart_sessions (recovered);

-- Compound index: most useful for the analytics query which filters both
-- last_activity AND reads recovered for aggregation
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_sessions_activity_recovered
  ON public.abandoned_cart_sessions (last_activity DESC, recovered);


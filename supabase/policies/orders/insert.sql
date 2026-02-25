-- ============================================================================
-- ORDERS INSERT POLICIES
-- ============================================================================

-- Remove any existing insert policies
DROP POLICY IF EXISTS "Authenticated users can create orders" ON orders;
DROP POLICY IF EXISTS "Service role can insert orders" ON orders;

-- Only service role (backend / webhook) can insert orders
CREATE POLICY "Service role can insert orders"
ON orders
FOR INSERT
TO service_role
WITH CHECK (true);
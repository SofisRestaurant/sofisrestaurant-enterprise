-- ============================================================================
-- ORDERS SELECT POLICIES
-- ============================================================================

-- Remove existing select policies
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;

-- Users can view only their own orders
CREATE POLICY "Users can view own orders"
ON orders
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
);

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
ON orders
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
);

-- Service role can view all orders
CREATE POLICY "Service role can view orders"
ON orders
FOR SELECT
TO service_role
USING (true);
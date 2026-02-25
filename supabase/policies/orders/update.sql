-- ============================================================================
-- ORDERS UPDATE POLICIES
-- ============================================================================

-- Remove existing update policies
DROP POLICY IF EXISTS "Users can update own pending orders" ON orders;
DROP POLICY IF EXISTS "Admins can update any order" ON orders;
DROP POLICY IF EXISTS "Service role can update orders" ON orders;

-- Users cannot update orders (financial records are immutable)
-- No UPDATE policy for authenticated users

-- Admins can update any order
CREATE POLICY "Admins can update any order"
ON orders
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Service role (webhook / backend) can update orders
CREATE POLICY "Service role can update orders"
ON orders
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);
CREATE POLICY "Admins can manage products"
ON products FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));


CREATE POLICY "Anyone can view order items for their orders"
ON order_items FOR SELECT
TO authenticated
USING (
  order_id IN (
    SELECT id FROM orders 
    WHERE user_id = auth.uid() 
    OR customer_email = (SELECT email FROM profiles WHERE id = auth.uid())
  )
);

CREATE POLICY "Admins can view all order items"
ON order_items FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Service role can insert order items"
ON order_items FOR INSERT
TO service_role
WITH CHECK (true);
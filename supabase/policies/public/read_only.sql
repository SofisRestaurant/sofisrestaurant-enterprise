CREATE POLICY "Anyone can view products"
ON products FOR SELECT
TO public
USING (available = true);

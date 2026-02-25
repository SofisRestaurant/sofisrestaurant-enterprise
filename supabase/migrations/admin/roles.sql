CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id AND email LIKE '%@sofisrestaurant.com'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

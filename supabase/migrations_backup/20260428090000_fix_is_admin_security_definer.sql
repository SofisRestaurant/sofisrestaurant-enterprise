CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id  = uid
      AND role = 'admin'
  );
$$;
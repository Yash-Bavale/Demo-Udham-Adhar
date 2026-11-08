
CREATE OR REPLACE FUNCTION public.has_any_staff_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','super_admin','operations','support','accounts','finance','manager','executive')
  )
$$;

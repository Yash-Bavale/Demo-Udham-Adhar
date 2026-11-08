DROP POLICY IF EXISTS "Admins can read all seo pages" ON public.seo_pages;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'::public.app_role
  )
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

CREATE POLICY "Admins can read all seo pages"
ON public.seo_pages
FOR SELECT
TO authenticated
USING (public.current_user_is_admin());
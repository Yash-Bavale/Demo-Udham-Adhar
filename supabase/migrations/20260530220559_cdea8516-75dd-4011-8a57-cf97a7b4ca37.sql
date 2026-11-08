DROP POLICY IF EXISTS "Public can read enabled seo pages" ON public.seo_pages;
DROP POLICY IF EXISTS "Admins can read all seo pages" ON public.seo_pages;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

CREATE POLICY "Public can read enabled seo pages"
ON public.seo_pages
FOR SELECT
TO anon, authenticated
USING (enabled = true);

CREATE POLICY "Admins can read all seo pages"
ON public.seo_pages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
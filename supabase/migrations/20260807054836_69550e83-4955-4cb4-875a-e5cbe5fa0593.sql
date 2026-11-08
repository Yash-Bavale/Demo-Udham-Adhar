CREATE TABLE public.sitemap_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id uuid NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  slug text NOT NULL,
  included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sitemap_overrides TO authenticated;
GRANT ALL ON public.sitemap_overrides TO service_role;

ALTER TABLE public.sitemap_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sitemap overrides"
ON public.sitemap_overrides FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER sitemap_overrides_touch
BEFORE UPDATE ON public.sitemap_overrides
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_sitemap_overrides_website ON public.sitemap_overrides(website_id);
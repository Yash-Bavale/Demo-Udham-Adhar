-- Extra brand fields
ALTER TABLE public.websites
  ADD COLUMN IF NOT EXISTS postal_address text,
  ADD COLUMN IF NOT EXISTS footer_unlock_code text;

-- Navigation items (header + footer link lists)
CREATE TABLE public.site_nav_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id uuid NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  nav_group text NOT NULL DEFAULT 'header',
  label text NOT NULL,
  path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  open_in_new boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_nav_items_website_group_idx
  ON public.site_nav_items (website_id, nav_group, sort_order);

GRANT SELECT ON public.site_nav_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_nav_items TO authenticated;
GRANT ALL ON public.site_nav_items TO service_role;

ALTER TABLE public.site_nav_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_nav_items public read active"
  ON public.site_nav_items FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "site_nav_items admin manage"
  ON public.site_nav_items FOR ALL
  TO authenticated
  USING (public.current_user_is_admin() OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.current_user_is_admin() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER site_nav_items_touch
  BEFORE UPDATE ON public.site_nav_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Editable content blocks
CREATE TABLE public.site_content_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id uuid NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  block_key text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_id, block_key)
);

CREATE INDEX site_content_blocks_website_idx
  ON public.site_content_blocks (website_id, block_key);

GRANT SELECT ON public.site_content_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content_blocks TO authenticated;
GRANT ALL ON public.site_content_blocks TO service_role;

ALTER TABLE public.site_content_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_content_blocks public read active"
  ON public.site_content_blocks FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "site_content_blocks admin manage"
  ON public.site_content_blocks FOR ALL
  TO authenticated
  USING (public.current_user_is_admin() OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.current_user_is_admin() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER site_content_blocks_touch
  BEFORE UPDATE ON public.site_content_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
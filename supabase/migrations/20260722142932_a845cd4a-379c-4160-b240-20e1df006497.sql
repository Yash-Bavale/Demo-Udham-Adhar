
-- ============ WEBSITES ============
CREATE TABLE public.websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.websites TO authenticated;
GRANT ALL ON public.websites TO service_role;
ALTER TABLE public.websites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "websites: staff can view"
  ON public.websites FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

CREATE POLICY "websites: admins manage"
  ON public.websites FOR ALL TO authenticated
  USING (public.current_user_is_admin() OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.current_user_is_admin() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER websites_touch BEFORE UPDATE ON public.websites
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SERVICE CATEGORIES ============
CREATE TABLE public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (website_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_categories TO authenticated;
GRANT ALL ON public.service_categories TO service_role;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_categories: staff view"
  ON public.service_categories FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

CREATE POLICY "service_categories: admins manage"
  ON public.service_categories FOR ALL TO authenticated
  USING (public.current_user_is_admin() OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.current_user_is_admin() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER service_categories_touch BEFORE UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SEED DEFAULT WEBSITE ============
INSERT INTO public.websites (name, domain, is_active, sort_order)
VALUES ('Udyam Aadhar Advisory', 'udyamadhar.in', true, 0)
ON CONFLICT (domain) DO NOTHING;

-- ============ EXTEND SERVICES ============
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS website_id UUID REFERENCES public.websites(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL;

UPDATE public.services
   SET website_id = (SELECT id FROM public.websites WHERE domain = 'udyamadhar.in')
 WHERE website_id IS NULL;

ALTER TABLE public.services ALTER COLUMN website_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_services_website ON public.services(website_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category_id);

-- ============ EXTEND LEADS ============
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS website_id UUID REFERENCES public.websites(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL;

-- Backfill service_id from the text "service" column via service_code match
UPDATE public.leads l
   SET service_id = s.id
  FROM public.services s
 WHERE l.service_id IS NULL
   AND l.service = s.service_code;

UPDATE public.leads
   SET website_id = (SELECT id FROM public.websites WHERE domain = 'udyamadhar.in')
 WHERE website_id IS NULL;

ALTER TABLE public.leads ALTER COLUMN website_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_website ON public.leads(website_id);
CREATE INDEX IF NOT EXISTS idx_leads_service_id ON public.leads(service_id);

-- ============ EXTEND APPLICATIONS ============
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS website_id UUID REFERENCES public.websites(id) ON DELETE RESTRICT;

UPDATE public.applications a
   SET website_id = l.website_id
  FROM public.leads l
 WHERE a.lead_id = l.id AND a.website_id IS NULL;

UPDATE public.applications
   SET website_id = (SELECT id FROM public.websites WHERE domain = 'udyamadhar.in')
 WHERE website_id IS NULL;

ALTER TABLE public.applications ALTER COLUMN website_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_website ON public.applications(website_id);

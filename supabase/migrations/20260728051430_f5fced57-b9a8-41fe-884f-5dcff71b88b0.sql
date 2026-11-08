-- 1. Admin panel visibility switch per website
ALTER TABLE public.websites
  ADD COLUMN IF NOT EXISTS allow_admin boolean NOT NULL DEFAULT true;

-- 2. Clone the primary website row into the new domain
INSERT INTO public.websites (
  name, domain, description, is_active, is_primary, sort_order, allow_admin,
  brand_name, legal_entity, company_name, support_email, support_phone,
  whatsapp_number, business_hours, primary_color, logo_asset_url,
  favicon_asset_url, sample_certificate_asset_url, legal_footer_line,
  postal_address, footer_unlock_code, google_site_verification, gtag_id
)
SELECT
  'Udyam Registrations', 'udyamregistrations.in', description, true, false,
  COALESCE((SELECT MAX(sort_order) FROM public.websites), 0) + 1, false,
  brand_name, legal_entity, company_name, support_email, support_phone,
  whatsapp_number, business_hours, primary_color, logo_asset_url,
  favicon_asset_url, sample_certificate_asset_url, legal_footer_line,
  postal_address, footer_unlock_code, NULL, gtag_id
FROM public.websites
WHERE domain = 'udyamadhar.in'
ON CONFLICT (domain) DO NOTHING;

DO $$
DECLARE
  src_id uuid;
  dst_id uuid;
BEGIN
  SELECT id INTO src_id FROM public.websites WHERE domain = 'udyamadhar.in';
  SELECT id INTO dst_id FROM public.websites WHERE domain = 'udyamregistrations.in';
  IF src_id IS NULL OR dst_id IS NULL THEN
    RAISE EXCEPTION 'source or destination website missing';
  END IF;

  -- 3. Categories (keep a code-free mapping via name)
  INSERT INTO public.service_categories (website_id, name, sort_order, is_active)
  SELECT dst_id, c.name, c.sort_order, c.is_active
  FROM public.service_categories c
  WHERE c.website_id = src_id
    AND NOT EXISTS (
      SELECT 1 FROM public.service_categories d
      WHERE d.website_id = dst_id AND d.name = c.name
    );

  -- 4. Services: same catalogue, own rows + own price, codes suffixed '--ur'
  INSERT INTO public.services (
    website_id, category_id, service_code, service_name, description,
    base_amount, gst_amount, total_amount, is_active, sort_order,
    sac_code, govt_portal_url, expected_processing_days, journey_key
  )
  SELECT
    dst_id,
    (SELECT d.id FROM public.service_categories d
      WHERE d.website_id = dst_id AND d.name = sc.name LIMIT 1),
    s.service_code || '--ur',
    s.service_name, s.description,
    s.base_amount, s.gst_amount, s.total_amount, s.is_active, s.sort_order,
    s.sac_code, s.govt_portal_url, s.expected_processing_days, s.journey_key
  FROM public.services s
  LEFT JOIN public.service_categories sc ON sc.id = s.category_id
  WHERE s.website_id = src_id
    AND NOT EXISTS (
      SELECT 1 FROM public.services x WHERE x.service_code = s.service_code || '--ur'
    );

  -- 5. Intake form schemas for the cloned service codes
  INSERT INTO public.service_form_schemas (
    service_code, title, description, schema, documents, is_active, version
  )
  SELECT f.service_code || '--ur', f.title, f.description, f.schema,
         f.documents, f.is_active, f.version
  FROM public.service_form_schemas f
  WHERE EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.website_id = src_id AND s.service_code = f.service_code
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.service_form_schemas g
      WHERE g.service_code = f.service_code || '--ur'
    );

  -- 6. Workflows for the cloned service codes
  INSERT INTO public.service_workflows (
    service_code, display_name, application_statuses, default_assignee_role, is_active
  )
  SELECT w.service_code || '--ur', w.display_name, w.application_statuses,
         w.default_assignee_role, w.is_active
  FROM public.service_workflows w
  WHERE EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.website_id = src_id AND s.service_code = w.service_code
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.service_workflows g
      WHERE g.service_code = w.service_code || '--ur'
    );

  -- 7. Navigation (header / footer groups)
  INSERT INTO public.site_nav_items (website_id, nav_group, label, path, sort_order, is_active, open_in_new)
  SELECT dst_id, n.nav_group, n.label, n.path, n.sort_order, n.is_active, n.open_in_new
  FROM public.site_nav_items n
  WHERE n.website_id = src_id
    AND NOT EXISTS (
      SELECT 1 FROM public.site_nav_items m
      WHERE m.website_id = dst_id AND m.nav_group = n.nav_group AND m.path = n.path AND m.label = n.label
    );

  -- 8. Homepage / shared content blocks
  INSERT INTO public.site_content_blocks (website_id, block_key, content, is_active, sort_order)
  SELECT dst_id, b.block_key, b.content, b.is_active, b.sort_order
  FROM public.site_content_blocks b
  WHERE b.website_id = src_id
  ON CONFLICT (website_id, block_key) DO NOTHING;
END $$;
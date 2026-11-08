
ALTER TABLE public.websites
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS legal_entity text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS support_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS business_hours text,
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS logo_asset_url text,
  ADD COLUMN IF NOT EXISTS favicon_asset_url text,
  ADD COLUMN IF NOT EXISTS sample_certificate_asset_url text,
  ADD COLUMN IF NOT EXISTS contentful_space_id text,
  ADD COLUMN IF NOT EXISTS contentful_delivery_token_secret text,
  ADD COLUMN IF NOT EXISTS legal_footer_line text,
  ADD COLUMN IF NOT EXISTS google_site_verification text,
  ADD COLUMN IF NOT EXISTS gtag_id text,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Allow public read of brand fields for the current site's landing pages
GRANT SELECT ON public.websites TO anon;

-- Backfill udyamadhar.in row from current brand constants
UPDATE public.websites
SET
  brand_name = COALESCE(brand_name, 'Udyam Aadhar'),
  legal_entity = COALESCE(legal_entity, 'Udyam Registration Consultancy & Assistance Services'),
  company_name = COALESCE(company_name, 'Business Help Services'),
  support_email = COALESCE(support_email, 'help@businesshelpservices.com'),
  primary_color = COALESCE(primary_color, '#1e3a8a'),
  legal_footer_line = COALESCE(
    legal_footer_line,
    'Udyam Aadhar is operated by Udyam Registration Consultancy & Assistance Services, a private consultancy. We are not affiliated with, authorised by, endorsed by, or associated with any government authority or department.'
  ),
  is_primary = true
WHERE domain = 'udyamadhar.in';

-- Ensure only one primary site
CREATE UNIQUE INDEX IF NOT EXISTS websites_only_one_primary
  ON public.websites ((is_primary)) WHERE is_primary = true;

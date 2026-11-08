UPDATE public.seo_pages
SET enabled = true, updated_at = now()
WHERE slug IN ('udyam-registration', 'msme-registration')
  AND page_type = 'article'
  AND enabled = false;
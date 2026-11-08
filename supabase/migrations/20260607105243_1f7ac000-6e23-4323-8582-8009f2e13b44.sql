
ALTER TABLE public.seo_pages
  ADD COLUMN IF NOT EXISTS page_type text NOT NULL DEFAULT 'service'
    CHECK (page_type IN ('service','article')),
  ADD COLUMN IF NOT EXISTS h1 text,
  ADD COLUMN IF NOT EXISTS meta_title text,
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS intro text,
  ADD COLUMN IF NOT EXISTS sections jsonb,
  ADD COLUMN IF NOT EXISTS faq jsonb,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS related_slugs text[],
  ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now();

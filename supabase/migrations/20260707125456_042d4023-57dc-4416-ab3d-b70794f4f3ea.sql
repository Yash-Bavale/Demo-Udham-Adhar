
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS govt_portal_url text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_category_check
  CHECK (category IS NULL OR category IN ('technical','order_related','suggestion_to_owner'));

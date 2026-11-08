
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS flow_id TEXT;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS sr_no INT;
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON public.email_templates(category, sr_no);

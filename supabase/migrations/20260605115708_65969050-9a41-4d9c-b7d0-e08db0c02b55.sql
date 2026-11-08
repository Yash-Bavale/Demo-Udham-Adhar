ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_duplicate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS leads_mobile_idx ON public.leads(mobile);
CREATE INDEX IF NOT EXISTS leads_email_lower_idx ON public.leads((lower(email)));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS public_ref text NOT NULL DEFAULT substr(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''), 1, 32);
CREATE UNIQUE INDEX IF NOT EXISTS leads_public_ref_key ON public.leads (public_ref);
COMMENT ON COLUMN public.leads.public_ref IS 'Random opaque id shown in customer URLs instead of the sequential lead code.';
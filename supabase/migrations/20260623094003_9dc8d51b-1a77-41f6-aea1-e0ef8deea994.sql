ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_applications_fulfilled_at ON public.applications (fulfilled_at);
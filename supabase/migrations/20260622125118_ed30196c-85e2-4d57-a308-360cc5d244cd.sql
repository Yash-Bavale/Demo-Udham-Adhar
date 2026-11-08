
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS pan_number TEXT,
  ADD COLUMN IF NOT EXISTS pan_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS aadhaar_number TEXT,
  ADD COLUMN IF NOT EXISTS aadhaar_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS udyam_number TEXT;

CREATE INDEX IF NOT EXISTS customers_pan_idx ON public.customers (upper(pan_number));
CREATE INDEX IF NOT EXISTS customers_gst_idx ON public.customers (upper(gst_number));
CREATE INDEX IF NOT EXISTS customers_udyam_idx ON public.customers (upper(udyam_number));
CREATE INDEX IF NOT EXISTS customers_aadhaar_idx ON public.customers (aadhaar_number);

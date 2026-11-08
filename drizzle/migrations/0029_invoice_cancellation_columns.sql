ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.invoices(id);
COMMENT ON COLUMN public.invoices.cancelled_at IS 'Set when an invoice number is cancelled (e.g. duplicate for same payment). Kept for GST audit; excluded from reports.';
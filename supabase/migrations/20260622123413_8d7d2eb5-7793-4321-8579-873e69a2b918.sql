
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS igst_rate NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS company_state_snapshot TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_state_snapshot TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS company_gstin_snapshot TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_gstin_snapshot TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS sac_code TEXT NOT NULL DEFAULT '998311';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS gstin TEXT;

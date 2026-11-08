
-- Lead status enum
CREATE TYPE public.lead_status AS ENUM (
  'lead_created',
  'payment_pending',
  'payment_successful',
  'details_pending',
  'documents_pending',
  'under_review',
  'under_process',
  'completed',
  'closed'
);

CREATE TYPE public.payment_status AS ENUM (
  'created',
  'attempted',
  'paid',
  'failed',
  'refunded'
);

-- Sequence for human-readable lead code
CREATE SEQUENCE public.lead_code_seq START 1000;

-- Leads
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_code TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT NOT NULL,
  state TEXT NOT NULL,
  language TEXT NOT NULL,
  service TEXT NOT NULL,
  base_amount NUMERIC(10,2) NOT NULL DEFAULT 99,
  gst_amount NUMERIC(10,2) NOT NULL DEFAULT 17.82,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 116.82,
  status public.lead_status NOT NULL DEFAULT 'lead_created',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_email ON public.leads(email);
CREATE INDEX idx_leads_mobile ON public.leads(mobile);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);

-- Auto-generate lead_code on insert: UA-YYYY-NNNNNN
CREATE OR REPLACE FUNCTION public.set_lead_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_code IS NULL THEN
    NEW.lead_code := 'UA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.lead_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_lead_code
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_lead_code();

-- updated_at touch
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_touch
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Payments
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status public.payment_status NOT NULL DEFAULT 'created',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_lead ON public.payments(lead_id);
CREATE INDEX idx_payments_order ON public.payments(razorpay_order_id);

CREATE TRIGGER trg_payments_touch
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- GRANTS — service role only (all writes go through server functions)
GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.payments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lead_code_seq TO service_role;

-- RLS — deny all by default; serverFns use service role which bypasses RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

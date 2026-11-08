-- Migration: 20260925220000_dispute_evidence_records.sql
-- Purpose: Complete audit log for generated payment and service dispute evidence packages

CREATE TABLE IF NOT EXISTS public.dispute_evidence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  application_code TEXT,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_by_name TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  selected_email_ids JSONB DEFAULT '[]'::jsonb,
  invoice_included BOOLEAN NOT NULL DEFAULT false,
  certificate_included BOOLEAN NOT NULL DEFAULT false,
  item_count INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_der_order_id ON public.dispute_evidence_records(order_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_der_generated_by ON public.dispute_evidence_records(generated_by);
CREATE INDEX IF NOT EXISTS idx_der_generated_at ON public.dispute_evidence_records(generated_at DESC);

-- Grants
GRANT SELECT, INSERT ON public.dispute_evidence_records TO authenticated;
GRANT ALL ON public.dispute_evidence_records TO service_role;

-- Row Level Security
ALTER TABLE public.dispute_evidence_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_dispute_evidence_records ON public.dispute_evidence_records;
CREATE POLICY staff_read_dispute_evidence_records ON public.dispute_evidence_records FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_any_staff_role(auth.uid())
  );

DROP POLICY IF EXISTS staff_insert_dispute_evidence_records ON public.dispute_evidence_records;
CREATE POLICY staff_insert_dispute_evidence_records ON public.dispute_evidence_records FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_any_staff_role(auth.uid())
  );
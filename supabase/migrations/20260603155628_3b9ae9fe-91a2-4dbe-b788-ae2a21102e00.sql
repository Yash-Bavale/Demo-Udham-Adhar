
-- Phase D: extend application_status enum with full lifecycle
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'form_submitted';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'documents_submitted';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'certificate_uploaded';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'certificate_ready';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'on_hold';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'refund_pending';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'consultation_pending';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'consultation_scheduled';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'rejected';

-- Phase D: status transition audit table for traceability
CREATE TABLE IF NOT EXISTS public.application_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.application_status_history TO authenticated;
GRANT ALL ON public.application_status_history TO service_role;
ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read status history" ON public.application_status_history
  FOR SELECT TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role) OR has_role(auth.uid(), 'support'::app_role) OR has_role(auth.uid(), 'accounts'::app_role));

CREATE POLICY "Staff insert status history" ON public.application_status_history
  FOR INSERT TO authenticated
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role));

CREATE INDEX IF NOT EXISTS idx_app_status_history_app ON public.application_status_history(application_id, created_at DESC);

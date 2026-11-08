DROP INDEX IF EXISTS public.email_queue_once_per_order_idx;
CREATE UNIQUE INDEX IF NOT EXISTS email_queue_once_per_order_idx ON public.email_queue (template_code, to_email, application_id)
  WHERE application_id IS NOT NULL AND template_code = 'E001' AND created_at > TIMESTAMPTZ '2026-09-15 11:10:00+00';

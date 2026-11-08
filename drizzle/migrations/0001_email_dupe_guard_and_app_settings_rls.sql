-- Race-proof guard for one-time-per-order emails (applies to new rows only).
CREATE UNIQUE INDEX IF NOT EXISTS email_queue_once_per_order_idx
  ON public.email_queue (template_code, to_email, application_id)
  WHERE application_id IS NOT NULL
    AND template_code IN ('E001','E007')
    AND created_at > TIMESTAMPTZ '2026-09-15 11:10:00+00';

-- Security: app_settings should only be readable by staff, not every signed-in user.
DROP POLICY IF EXISTS "authenticated read app_settings" ON public.app_settings;
CREATE POLICY "staff read app_settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
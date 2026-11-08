
-- Phase 4A — Email infrastructure + P1 bug fixes

-- ─── P1-2: case-insensitive lead dedup index ───
CREATE INDEX IF NOT EXISTS leads_email_lower_idx ON public.leads ((lower(email)));
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON public.payments (created_at DESC);

-- ─── SMTP settings (singleton; super_admin only) ───
CREATE TABLE public.smtp_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_email    text NOT NULL,
  from_name     text NOT NULL DEFAULT 'Business Help Services',
  reply_to      text,
  daily_quota   integer NOT NULL DEFAULT 2000,
  is_enabled    boolean NOT NULL DEFAULT false,
  notes         text,
  updated_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smtp_settings TO authenticated;
GRANT ALL ON public.smtp_settings TO service_role;
ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin manage smtp"
  ON public.smtp_settings FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE TRIGGER smtp_settings_touch BEFORE UPDATE ON public.smtp_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Email templates ───
CREATE TABLE public.email_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  name         text NOT NULL,
  subject      text NOT NULL,
  body_html    text NOT NULL,
  body_text    text,
  description  text,
  variables    text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_enabled   boolean NOT NULL DEFAULT true,
  is_system    boolean NOT NULL DEFAULT false,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage templates"
  ON public.email_templates FOR ALL TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Staff read templates"
  ON public.email_templates FOR SELECT TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'operations'::app_role) OR has_role(auth.uid(), 'support'::app_role)
      OR has_role(auth.uid(), 'accounts'::app_role));
CREATE TRIGGER email_templates_touch BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Email queue (pending sends, retries, DLQ) ───
CREATE TYPE email_queue_status AS ENUM ('queued', 'sending', 'sent', 'failed', 'dlq');

CREATE TABLE public.email_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code  text,
  to_email       text NOT NULL,
  to_name        text,
  subject        text NOT NULL,
  body_html      text NOT NULL,
  body_text      text,
  variables      jsonb NOT NULL DEFAULT '{}'::jsonb,
  lead_id        uuid,
  application_id uuid,
  status         email_queue_status NOT NULL DEFAULT 'queued',
  attempts       integer NOT NULL DEFAULT 0,
  max_attempts   integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error     text,
  scheduled_at   timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_queue TO authenticated;
GRANT ALL ON public.email_queue TO service_role;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read queue"
  ON public.email_queue FOR SELECT TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'operations'::app_role) OR has_role(auth.uid(), 'support'::app_role)
      OR has_role(auth.uid(), 'accounts'::app_role));
CREATE POLICY "Admins write queue"
  ON public.email_queue FOR ALL TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER email_queue_touch BEFORE UPDATE ON public.email_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX email_queue_pending_idx ON public.email_queue (status, next_attempt_at)
  WHERE status IN ('queued', 'failed');
CREATE INDEX email_queue_lead_idx ON public.email_queue (lead_id);

-- ─── Email logs (audit trail of every send attempt) ───
CREATE TYPE email_log_status AS ENUM ('sent', 'failed', 'bounced');

CREATE TABLE public.email_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id       uuid REFERENCES public.email_queue(id) ON DELETE SET NULL,
  template_code  text,
  to_email       text NOT NULL,
  subject        text NOT NULL,
  status         email_log_status NOT NULL,
  smtp_response  text,
  error_message  text,
  attempt        integer NOT NULL DEFAULT 1,
  lead_id        uuid,
  application_id uuid,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.email_logs TO authenticated;
GRANT ALL ON public.email_logs TO service_role;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read logs"
  ON public.email_logs FOR SELECT TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'operations'::app_role) OR has_role(auth.uid(), 'support'::app_role)
      OR has_role(auth.uid(), 'accounts'::app_role));
CREATE INDEX email_logs_to_idx ON public.email_logs (to_email);
CREATE INDEX email_logs_sent_at_idx ON public.email_logs (sent_at DESC);
CREATE INDEX email_logs_status_idx ON public.email_logs (status);

-- ─── Seed system templates ───
INSERT INTO public.email_templates (code, name, subject, body_html, description, is_system, variables) VALUES
  ('contact_acknowledgement', 'Contact Form – Auto Ack',
   'We received your message — Business Help Services',
   '<p>Hi {{name}},</p><p>Thanks for reaching out. Our team will reply within one working day.</p><p>Reference: <strong>{{lead_code}}</strong></p><p>— Business Help Services</p>',
   'Sent automatically when a visitor submits the Contact form.', true,
   ARRAY['name','lead_code','email','mobile']),
  ('lead_welcome', 'Lead – Welcome After Submission',
   'Your application {{lead_code}} is received',
   '<p>Hi {{name}},</p><p>We''ve received your request for <strong>{{service}}</strong>. Reference number: <strong>{{lead_code}}</strong>.</p><p>Please complete payment to start processing.</p>',
   'Sent right after a lead is created on the website.', true,
   ARRAY['name','lead_code','service']),
  ('payment_success', 'Payment Successful + Invoice',
   'Payment received for {{lead_code}}',
   '<p>Hi {{name}},</p><p>We have received your payment of ₹{{total_amount}} for <strong>{{service}}</strong>.</p><p>Your invoice is attached and our team will begin processing your application shortly.</p>',
   'Sent on successful payment with invoice attachment.', true,
   ARRAY['name','lead_code','service','total_amount']),
  ('complaint_submitted', 'Complaint Submitted (Forgot Mobile)',
   'Complaint {{complaint_number}} submitted',
   '<p>Hi {{name}},</p><p>Your complaint <strong>{{complaint_number}}</strong> has been filed. We will follow up after 10 working days.</p>',
   'Sent when ops files a Forgot-Mobile complaint.', true,
   ARRAY['name','complaint_number']),
  ('certificate_delivery', 'Certificate Ready',
   'Your certificate for {{lead_code}} is ready',
   '<p>Hi {{name}},</p><p>Your <strong>{{service}}</strong> certificate is ready. Click below to view or download.</p><p><a href="{{certificate_url}}">View certificate</a></p>',
   'Sent when ops uploads the final certificate.', true,
   ARRAY['name','lead_code','service','certificate_url']);

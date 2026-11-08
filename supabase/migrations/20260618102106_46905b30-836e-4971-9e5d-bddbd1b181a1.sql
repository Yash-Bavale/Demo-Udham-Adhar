
-- 1. Closure stage enum
DO $$ BEGIN
  CREATE TYPE public.closure_stage AS ENUM ('none','request_received','closure_pending','notice_sent','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Applications columns for cancellation workflow
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closure_stage public.closure_stage NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS closure_next_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS applications_closure_next_idx
  ON public.applications (closure_next_at)
  WHERE closure_stage <> 'none' AND closure_stage <> 'closed';

-- 3. Workflow settings table (single-row config)
CREATE TABLE IF NOT EXISTS public.workflow_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step1_template_code TEXT NOT NULL DEFAULT 'cancellation-request-received',
  step2_days INTEGER NOT NULL DEFAULT 7,
  step2_template_code TEXT NOT NULL DEFAULT 'final-notice-before-closure',
  step3_days INTEGER NOT NULL DEFAULT 7,
  step3_template_code TEXT NOT NULL DEFAULT 'order-closed-notice',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_settings TO authenticated;
GRANT ALL ON public.workflow_settings TO service_role;

ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read workflow_settings" ON public.workflow_settings;
CREATE POLICY "Staff read workflow_settings" ON public.workflow_settings
  FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "Admins write workflow_settings" ON public.workflow_settings;
CREATE POLICY "Admins write workflow_settings" ON public.workflow_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER workflow_settings_touch
  BEFORE UPDATE ON public.workflow_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed the singleton row
INSERT INTO public.workflow_settings (step2_days, step3_days)
SELECT 7, 7
WHERE NOT EXISTS (SELECT 1 FROM public.workflow_settings);

-- 4. Seed cancellation email templates (system templates)
INSERT INTO public.email_templates (code, name, subject, body_html, body_text, description, variables, is_enabled, is_system)
VALUES
  ('cancellation-request-received',
   'Cancellation Request Received',
   'Service Cancellation Request Received — {{order_number}}',
   '<p>Hi {{customer_name}},</p><p>We have received your request to cancel <strong>{{service_name}}</strong> (Order {{order_number}}).</p><p>Please note our refund policy: <a href="{{refund_policy_url}}">{{refund_policy_url}}</a>. Service execution has already been initiated; please respond within 7 days if you wish to continue.</p><p>— Business Help Services</p>',
   'Hi {{customer_name}}, we have received your cancellation request for {{service_name}} (Order {{order_number}}). Refund policy: {{refund_policy_url}}. Please respond within 7 days.',
   'Step 1 of cancellation workflow — sent immediately on cancellation request.',
   ARRAY['customer_name','order_number','service_name','refund_policy_url'],
   true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.email_templates (code, name, subject, body_html, body_text, description, variables, is_enabled, is_system)
VALUES
  ('final-notice-before-closure',
   'Final Notice Before Order Closure',
   'Final Notice Before Order Closure — {{order_number}}',
   '<p>Hi {{customer_name}},</p><p>We have not received a response regarding your cancellation request for Order <strong>{{order_number}}</strong>.</p><p>If we do not hear back within 7 days, the order may be marked as closed for operational purposes.</p><p>— Business Help Services</p>',
   'Hi {{customer_name}}, final notice: respond within 7 days regarding Order {{order_number}} or it may be closed for operational purposes.',
   'Step 2 of cancellation workflow — sent 7 days after Step 1.',
   ARRAY['customer_name','order_number'],
   true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.email_templates (code, name, subject, body_html, body_text, description, variables, is_enabled, is_system)
VALUES
  ('order-closed-notice',
   'Order Closed',
   'Order Closed — {{order_number}}',
   '<p>Hi {{customer_name}},</p><p>Order <strong>{{order_number}}</strong> ({{service_name}}) has been marked as closed in our records as per our closure policy.</p><p>If you have any questions, please contact <a href="mailto:{{support_email}}">{{support_email}}</a>.</p><p>— Business Help Services</p>',
   'Hi {{customer_name}}, Order {{order_number}} ({{service_name}}) has been closed. Contact {{support_email}} with any questions.',
   'Step 3 of cancellation workflow — sent 7 days after Step 2.',
   ARRAY['customer_name','order_number','service_name','support_email'],
   true, true)
ON CONFLICT (code) DO NOTHING;

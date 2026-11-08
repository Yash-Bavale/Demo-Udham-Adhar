
-- =========================================================
-- Phase 1 — Service Workflow Engine: schema, RLS, seed data
-- =========================================================

-- 1) workflow_status enum --------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.workflow_status AS ENUM (
    'new',
    'documents_pending',
    'processing',
    'government_portal_pending',
    'verification_pending',
    'external_dependency',
    'waiting_for_customer',
    'waiting_for_documents',
    'customer_non_responsive',
    'processing_resumed',
    'completed',
    'pending_closure',
    'closed',
    'refund_review',
    'refund_closed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_reminder_kind AS ENUM (
    'followup_3d','followup_5d','followup_7d','closure_24h','custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_reminder_status AS ENUM (
    'pending','sent','cancelled','failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refund_request_status AS ENUM (
    'pending','approved','rejected','info_needed','escalated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_ticket_state AS ENUM (
    'open','pending','waiting_customer','closed','escalated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) applications.workflow_status ----------------------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS workflow_status public.workflow_status,
  ADD COLUMN IF NOT EXISTS workflow_delay_reason TEXT,
  ADD COLUMN IF NOT EXISTS workflow_expected_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workflow_priority TEXT;

-- 3) support_tickets.ticket_state ---------------------------------------
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_state public.support_ticket_state NOT NULL DEFAULT 'open';

-- 4) workflow_events -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  actor_id UUID,
  actor_name TEXT NOT NULL DEFAULT 'System',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  customer_visible BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_events_app_idx ON public.workflow_events(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_events_lead_idx ON public.workflow_events(lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_events TO authenticated;
GRANT ALL ON public.workflow_events TO service_role;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_events_staff_all ON public.workflow_events;
CREATE POLICY workflow_events_staff_all ON public.workflow_events
  FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));

-- 5) workflow_reminders --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  kind public.workflow_reminder_kind NOT NULL,
  template_code TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  assigned_to UUID,
  status public.workflow_reminder_status NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_reminders_due_idx
  ON public.workflow_reminders(status, due_at);
CREATE INDEX IF NOT EXISTS workflow_reminders_app_idx
  ON public.workflow_reminders(application_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_reminders TO authenticated;
GRANT ALL ON public.workflow_reminders TO service_role;
ALTER TABLE public.workflow_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_reminders_staff_all ON public.workflow_reminders;
CREATE POLICY workflow_reminders_staff_all ON public.workflow_reminders
  FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));

DROP TRIGGER IF EXISTS trg_workflow_reminders_touch ON public.workflow_reminders;
CREATE TRIGGER trg_workflow_reminders_touch
  BEFORE UPDATE ON public.workflow_reminders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) Reason libraries ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_delay_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_delay_reasons TO authenticated;
GRANT ALL ON public.workflow_delay_reasons TO service_role;
ALTER TABLE public.workflow_delay_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wdr_staff_all ON public.workflow_delay_reasons;
CREATE POLICY wdr_staff_all ON public.workflow_delay_reasons
  FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));
DROP TRIGGER IF EXISTS trg_wdr_touch ON public.workflow_delay_reasons;
CREATE TRIGGER trg_wdr_touch BEFORE UPDATE ON public.workflow_delay_reasons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.workflow_closure_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_closure_reasons TO authenticated;
GRANT ALL ON public.workflow_closure_reasons TO service_role;
ALTER TABLE public.workflow_closure_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wcr_staff_all ON public.workflow_closure_reasons;
CREATE POLICY wcr_staff_all ON public.workflow_closure_reasons
  FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));
DROP TRIGGER IF EXISTS trg_wcr_touch ON public.workflow_closure_reasons;
CREATE TRIGGER trg_wcr_touch BEFORE UPDATE ON public.workflow_closure_reasons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7) Automation rules ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_status public.workflow_status NOT NULL,
  wait_days INTEGER NOT NULL DEFAULT 3,
  action_type TEXT NOT NULL,  -- send_email | create_reminder | notify_executive
  template_code TEXT,
  repeat_count INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_automation_rules TO authenticated;
GRANT ALL ON public.workflow_automation_rules TO service_role;
ALTER TABLE public.workflow_automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS war_staff_all ON public.workflow_automation_rules;
CREATE POLICY war_staff_all ON public.workflow_automation_rules
  FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));
DROP TRIGGER IF EXISTS trg_war_touch ON public.workflow_automation_rules;
CREATE TRIGGER trg_war_touch BEFORE UPDATE ON public.workflow_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8) Refund requests -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  reason TEXT,
  reason_code TEXT,
  status public.refund_request_status NOT NULL DEFAULT 'pending',
  refund_amount NUMERIC(12,2),
  customer_notes TEXT,
  admin_notes TEXT,
  reviewer_id UUID,
  decided_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refund_requests_app_idx ON public.refund_requests(application_id);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx ON public.refund_requests(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_requests TO authenticated;
GRANT ALL ON public.refund_requests TO service_role;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refund_requests_staff_all ON public.refund_requests;
CREATE POLICY refund_requests_staff_all ON public.refund_requests
  FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));
DROP TRIGGER IF EXISTS trg_refund_requests_touch ON public.refund_requests;
CREATE TRIGGER trg_refund_requests_touch BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 9) Seed Reason Libraries ----------------------------------------------
INSERT INTO public.workflow_delay_reasons (code, label, sort_order) VALUES
  ('government_portal_down','Government Portal Down',10),
  ('server_downtime','Server Downtime',20),
  ('technical_issue','Technical Issue',30),
  ('verification_pending','Verification Pending',40),
  ('authority_delay','Authority Delay',50),
  ('third_party_dependency','Third Party Dependency',60),
  ('other','Other',900)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.workflow_closure_reasons (code, label, sort_order) VALUES
  ('government_platform_assumption','Government Platform Assumption',10),
  ('change_of_mind','Change of Mind',20),
  ('user_does_not_wish_to_proceed','User Does Not Wish To Proceed',30),
  ('otp_not_provided','OTP Not Provided',40),
  ('verification_failed','Verification Failed',50),
  ('documents_missing','Documents Missing',60),
  ('customer_non_responsive','Customer Non Responsive',70),
  ('eligibility_issue','Eligibility Issue',80),
  ('government_dependency','Government Dependency',90),
  ('server_issue','Server Issue',100),
  ('technical_issue','Technical Issue',110),
  ('operational_issue','Operational Issue',120),
  ('service_already_started','Service Already Started',130),
  ('other','Other',900)
ON CONFLICT (code) DO NOTHING;

-- 10) Default automation rules (3/5/7 day cadence for external delay) ----
INSERT INTO public.workflow_automation_rules
  (name, trigger_status, wait_days, action_type, template_code, repeat_count, is_active)
VALUES
  ('External delay — 3 day update','external_dependency',3,'send_email','workflow_processing_update_3d',1,TRUE),
  ('External delay — 5 day update','external_dependency',5,'send_email','workflow_processing_update_5d',1,TRUE),
  ('External delay — 7 day update','external_dependency',7,'send_email','workflow_processing_update_7d',1,TRUE),
  ('Government portal — 3 day update','government_portal_pending',3,'send_email','workflow_processing_update_3d',1,TRUE),
  ('Customer non-responsive — 24h close warning','customer_non_responsive',1,'send_email','workflow_no_response_warning',1,TRUE)
ON CONFLICT DO NOTHING;


-- BUSINESS HOURS CONFIG (single row)
CREATE TABLE public.business_hours_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  open_time TIME NOT NULL DEFAULT '10:00',
  close_time TIME NOT NULL DEFAULT '18:00',
  working_days INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6], -- 0=Sun..6=Sat
  holidays DATE[] NOT NULL DEFAULT ARRAY[]::DATE[],
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.business_hours_config TO authenticated;
GRANT ALL ON public.business_hours_config TO service_role;
ALTER TABLE public.business_hours_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Any staff can read business hours"
  ON public.business_hours_config FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin can update business hours"
  ON public.business_hours_config FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin can insert business hours"
  ON public.business_hours_config FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.business_hours_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- DELAY REASONS LOOKUP
CREATE TABLE public.delay_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('customer_side','our_side')),
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  requires_remarks BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.delay_reasons TO authenticated;
GRANT ALL ON public.delay_reasons TO service_role;
ALTER TABLE public.delay_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read delay reasons"
  ON public.delay_reasons FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin can manage delay reasons"
  ON public.delay_reasons FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.delay_reasons (category, code, label, requires_remarks, sort_order) VALUES
  ('customer_side','CUSTOMER_BUSY','Customer Busy / Not Available Right Now',false,10),
  ('customer_side','WAITING_OTP','Waiting for OTP from Customer',false,20),
  ('customer_side','NOT_RESPONDING','Customer Not Responding to Calls or Messages',false,30),
  ('customer_side','REQUESTED_LATER','Customer Requested Callback at a Later Time',false,40),
  ('customer_side','WRONG_DOCUMENTS','Incorrect or Incomplete Documents Submitted',false,50),
  ('customer_side','REQUESTED_CANCEL','Customer Requested Cancellation',false,60),
  ('customer_side','NO_SHOW','Customer Did Not Appear for Scheduled Consultation',false,70),
  ('customer_side','OTHER_CUSTOMER','Other (requires remarks)',true,999),
  ('our_side','PORTAL_DOWN','Government Portal Temporarily Unavailable',false,10),
  ('our_side','PORTAL_ERROR','Government Portal Technical Error',false,20),
  ('our_side','PORTAL_MAINTENANCE','Scheduled Government Portal Maintenance',false,30),
  ('our_side','INTERNAL_DELAY','Internal Processing Delay',false,40),
  ('our_side','AWAITING_GOVT_OTP','Awaiting OTP or Verification from Government System',false,50),
  ('our_side','EMPLOYEE_LEAVE','Employee Unavailable / On Leave',false,60),
  ('our_side','SYSTEM_ISSUE','System Technical Issue',false,70),
  ('our_side','AWAITING_REVIEW','Awaiting Internal Review or Approval',false,80),
  ('our_side','OTHER_OUR_SIDE','Other (requires remarks)',true,999)
ON CONFLICT (code) DO NOTHING;

-- ORDER SCHEDULERS
CREATE TABLE public.order_schedulers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  scheduler_type TEXT NOT NULL CHECK (scheduler_type IN ('customer_side_delay','our_side_delay')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped','completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fires_at TIMESTAMPTZ,                      -- wall-clock instant when the timer next fires
  business_seconds_total INT,                -- e.g. 86400 for 24h business-time
  business_seconds_remaining INT,            -- saved on pause
  paused_at TIMESTAMPTZ,
  paused_by_ticket_id UUID REFERENCES public.support_tickets(id),
  resumed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  stop_reason TEXT,
  stop_triggered_by TEXT,
  reason_id UUID REFERENCES public.delay_reasons(id),
  remarks TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_schedulers_app ON public.order_schedulers(application_id);
CREATE INDEX idx_order_schedulers_due ON public.order_schedulers(status, fires_at) WHERE status = 'active';
-- Only one active/paused scheduler per order:
CREATE UNIQUE INDEX one_open_scheduler_per_order
  ON public.order_schedulers(application_id)
  WHERE status IN ('active','paused');
GRANT SELECT, INSERT, UPDATE ON public.order_schedulers TO authenticated;
GRANT ALL ON public.order_schedulers TO service_role;
ALTER TABLE public.order_schedulers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read schedulers"
  ON public.order_schedulers FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff can insert schedulers"
  ON public.order_schedulers FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff can update schedulers"
  ON public.order_schedulers FOR UPDATE
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));

CREATE TRIGGER trg_order_schedulers_touch
  BEFORE UPDATE ON public.order_schedulers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ORDER REMINDERS (Scheduler 3 sub-options)
CREATE TABLE public.order_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  scheduler_id UUID REFERENCES public.order_schedulers(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('manual','auto_2hr','stopped')),
  remind_at TIMESTAMPTZ,
  interval_business_seconds INT DEFAULT 7200,
  times_fired INT NOT NULL DEFAULT 0,
  last_fired_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  stopped_at TIMESTAMPTZ,
  stop_reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_reminders_app ON public.order_reminders(application_id);
CREATE INDEX idx_order_reminders_due ON public.order_reminders(is_active, remind_at) WHERE is_active = true;
GRANT SELECT, INSERT, UPDATE ON public.order_reminders TO authenticated;
GRANT ALL ON public.order_reminders TO service_role;
ALTER TABLE public.order_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read reminders"
  ON public.order_reminders FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff can write reminders"
  ON public.order_reminders FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff can update reminders"
  ON public.order_reminders FOR UPDATE
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));

-- Extend applications with the v2 workflow columns (safe/optional)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS order_status TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent')),
  ADD COLUMN IF NOT EXISTS closure_reason_id UUID REFERENCES public.delay_reasons(id),
  ADD COLUMN IF NOT EXISTS closure_remarks TEXT,
  ADD COLUMN IF NOT EXISTS form_link_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS form_link_sent_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_requested_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_order_status ON public.applications(order_status);
CREATE INDEX IF NOT EXISTS idx_applications_priority ON public.applications(priority) WHERE priority <> 'normal';

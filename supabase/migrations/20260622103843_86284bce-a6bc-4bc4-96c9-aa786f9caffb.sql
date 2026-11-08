
-- =========================================================================
-- PHASE 0 — DATABASE FOUNDATION
-- =========================================================================

-- 0. Orphan cleanup (must happen before FK constraints)
DELETE FROM public.invoices i
 WHERE i.payment_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = i.payment_id);

UPDATE public.invoices i SET application_id = NULL
 WHERE i.application_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = i.application_id);

UPDATE public.documents d SET application_id = NULL
 WHERE d.application_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = d.application_id);

-- 1. Foreign keys (idempotent via DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_leads_customer') THEN
    ALTER TABLE public.leads ADD CONSTRAINT fk_leads_customer
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_applications_lead') THEN
    ALTER TABLE public.applications ADD CONSTRAINT fk_applications_lead
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_applications_customer') THEN
    ALTER TABLE public.applications ADD CONSTRAINT fk_applications_customer
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_payments_application') THEN
    ALTER TABLE public.payments ADD CONSTRAINT fk_payments_application
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_invoices_payment') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_payment
      FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_invoices_application') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_application
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_documents_application') THEN
    ALTER TABLE public.documents ADD CONSTRAINT fk_documents_application
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_complaints_application') THEN
    ALTER TABLE public.complaints ADD CONSTRAINT fk_complaints_application
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 2. Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='lead_status_enum') THEN
    CREATE TYPE public.lead_status_enum AS ENUM (
      'new_lead','contacted','follow_up_required','payment_pending','payment_failed',
      'payment_successful','welcome_mail_sent','documents_pending','under_process',
      'uninterested','refund_requested','refund_approved','refunded','closed','closed_refunded'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='fulfillment_status_enum') THEN
    CREATE TYPE public.fulfillment_status_enum AS ENUM (
      'order_received','documents_received','verification_pending','application_submitted',
      'under_processing','completed','cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='payment_status_enum') THEN
    CREATE TYPE public.payment_status_enum AS ENUM (
      'pending','paid','partially_paid','refunded','cancelled','failed'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='complaint_status_enum') THEN
    CREATE TYPE public.complaint_status_enum AS ENUM (
      'draft','submitted','under_review','awaiting_response','resolved','closed'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ticket_status_enum') THEN
    CREATE TYPE public.ticket_status_enum AS ENUM (
      'open','in_progress','waiting_customer','resolved','closed'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='priority_enum') THEN
    CREATE TYPE public.priority_enum AS ENUM ('high','medium','low');
  END IF;
END $$;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_status_v2 public.lead_status_enum DEFAULT 'new_lead';
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS fulfillment_status public.fulfillment_status_enum DEFAULT 'order_received';

-- 3. Soft-delete + block hard deletes
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DROP POLICY IF EXISTS no_hard_delete_leads ON public.leads;
CREATE POLICY no_hard_delete_leads ON public.leads FOR DELETE USING (false);
DROP POLICY IF EXISTS no_hard_delete_applications ON public.applications;
CREATE POLICY no_hard_delete_applications ON public.applications FOR DELETE USING (false);
DROP POLICY IF EXISTS no_hard_delete_customers ON public.customers;
CREATE POLICY no_hard_delete_customers ON public.customers FOR DELETE USING (false);

-- 4. Refund tracking
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMPTZ;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS refund_approved_at TIMESTAMPTZ;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS refund_approved_by UUID REFERENCES auth.users(id);
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMPTZ;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS refund_gateway_ref TEXT;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS documents_deleted_at TIMESTAMPTZ;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS documents_deleted_reason TEXT;

-- 5. Lead follow-up
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS followup_note TEXT;
-- assigned_to already exists

-- 6. New tables
-- application_events (tamper-evident)
CREATE TABLE IF NOT EXISTS public.application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id),
  customer_id UUID REFERENCES public.customers(id),
  event_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  staff_name TEXT NOT NULL,
  staff_role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT ON public.application_events TO authenticated;
GRANT ALL ON public.application_events TO service_role;
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_read_application_events ON public.application_events;
CREATE POLICY staff_read_application_events ON public.application_events FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
DROP POLICY IF EXISTS staff_insert_application_events ON public.application_events;
CREATE POLICY staff_insert_application_events ON public.application_events FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE OR REPLACE RULE no_update_application_events AS ON UPDATE TO public.application_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_delete_application_events AS ON DELETE TO public.application_events DO INSTEAD NOTHING;
CREATE INDEX IF NOT EXISTS idx_app_events_app ON public.application_events(application_id);
CREATE INDEX IF NOT EXISTS idx_app_events_lead ON public.application_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_app_events_created ON public.application_events(created_at DESC);

-- audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_by_name TEXT,
  changed_by_role TEXT,
  old_data JSONB,
  new_data JSONB,
  changed_fields JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_read_audit_log ON public.audit_log;
CREATE POLICY staff_read_audit_log ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS staff_insert_audit_log ON public.audit_log;
CREATE POLICY staff_insert_audit_log ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON public.audit_log(table_name, record_id);

-- tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  application_id UUID REFERENCES public.applications(id),
  lead_id UUID REFERENCES public.leads(id),
  customer_id UUID REFERENCES public.customers(id),
  due_date TIMESTAMPTZ,
  priority public.priority_enum DEFAULT 'medium',
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_read_tasks ON public.tasks;
CREATE POLICY staff_read_tasks ON public.tasks FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
DROP POLICY IF EXISTS staff_write_tasks ON public.tasks;
CREATE POLICY staff_write_tasks ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));
DROP POLICY IF EXISTS staff_update_tasks ON public.tasks;
CREATE POLICY staff_update_tasks ON public.tasks FOR UPDATE TO authenticated
  USING (public.has_any_staff_role(auth.uid())) WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks(assigned_to) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.tasks(due_date) WHERE is_completed = false;
DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- support_tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE,
  customer_id UUID REFERENCES public.customers(id),
  application_id UUID REFERENCES public.applications(id),
  service_id UUID REFERENCES public.services(id),
  subject TEXT NOT NULL,
  description TEXT,
  priority public.priority_enum DEFAULT 'medium',
  status public.ticket_status_enum DEFAULT 'open',
  assigned_to UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_read_tickets ON public.support_tickets;
CREATE POLICY staff_read_tickets ON public.support_tickets FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
DROP POLICY IF EXISTS staff_insert_tickets ON public.support_tickets;
CREATE POLICY staff_insert_tickets ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));
DROP POLICY IF EXISTS staff_update_tickets ON public.support_tickets;
CREATE POLICY staff_update_tickets ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_any_staff_role(auth.uid())) WITH CHECK (public.has_any_staff_role(auth.uid()));
DROP TRIGGER IF EXISTS trg_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ticket_replies
CREATE TABLE IF NOT EXISTS public.ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT ON public.ticket_replies TO authenticated;
GRANT ALL ON public.ticket_replies TO service_role;
ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_read_replies ON public.ticket_replies;
CREATE POLICY staff_read_replies ON public.ticket_replies FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
DROP POLICY IF EXISTS staff_insert_replies ON public.ticket_replies;
CREATE POLICY staff_insert_replies ON public.ticket_replies FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));

-- follow_ups
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id),
  customer_id UUID REFERENCES public.customers(id),
  application_id UUID REFERENCES public.applications(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  assigned_to UUID REFERENCES auth.users(id),
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completion_note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_read_followups ON public.follow_ups;
CREATE POLICY staff_read_followups ON public.follow_ups FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
DROP POLICY IF EXISTS staff_insert_followups ON public.follow_ups;
CREATE POLICY staff_insert_followups ON public.follow_ups FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));
DROP POLICY IF EXISTS staff_update_followups ON public.follow_ups;
CREATE POLICY staff_update_followups ON public.follow_ups FOR UPDATE TO authenticated
  USING (public.has_any_staff_role(auth.uid())) WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_followups_scheduled ON public.follow_ups(scheduled_at) WHERE is_completed = false;

-- 7. Trigger: log application status / assignment changes
CREATE OR REPLACE FUNCTION public.log_application_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff_name TEXT := 'System';
  v_staff_role TEXT := 'system';
BEGIN
  BEGIN
    SELECT COALESCE(p.display_name, p.email, 'Staff'), COALESCE(ur.role::TEXT, 'staff')
      INTO v_staff_name, v_staff_role
      FROM public.profiles p
      LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
     WHERE p.id = auth.uid()
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status THEN
    INSERT INTO public.application_events
      (application_id, lead_id, customer_id, event_type, old_value, new_value, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.lead_id, NEW.customer_id, 'status_change',
       OLD.fulfillment_status::TEXT, NEW.fulfillment_status::TEXT,
       auth.uid(), v_staff_name, v_staff_role);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.application_events
      (application_id, lead_id, customer_id, event_type, old_value, new_value, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.lead_id, NEW.customer_id, 'assignment_change',
       OLD.assigned_to::TEXT, NEW.assigned_to::TEXT,
       auth.uid(), v_staff_name, v_staff_role);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_application_events ON public.applications;
CREATE TRIGGER trg_application_events AFTER UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.log_application_event();

-- 8. Trigger: log lead status changes
CREATE OR REPLACE FUNCTION public.log_lead_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff_name TEXT := 'System';
  v_staff_role TEXT := 'system';
BEGIN
  BEGIN
    SELECT COALESCE(p.display_name, p.email, 'Staff'), COALESCE(ur.role::TEXT, 'staff')
      INTO v_staff_name, v_staff_role
      FROM public.profiles p
      LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
     WHERE p.id = auth.uid()
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF OLD.lead_status_v2 IS DISTINCT FROM NEW.lead_status_v2 THEN
    INSERT INTO public.application_events
      (lead_id, customer_id, event_type, old_value, new_value, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.customer_id, 'lead_status_change',
       OLD.lead_status_v2::TEXT, NEW.lead_status_v2::TEXT,
       auth.uid(), v_staff_name, v_staff_role);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_status_change ON public.leads;
CREATE TRIGGER trg_lead_status_change AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_status_change();

-- 9. customer_stats view
CREATE OR REPLACE VIEW public.customer_stats AS
SELECT
  c.id AS customer_id,
  COUNT(DISTINCT a.id) AS total_applications,
  COUNT(DISTINCT a.id) FILTER (WHERE a.fulfillment_status = 'completed') AS completed_applications,
  COUNT(DISTINCT a.id) FILTER (WHERE a.fulfillment_status NOT IN ('completed','cancelled')) AS pending_applications,
  COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0) AS lifetime_value,
  MAX(a.created_at) AS last_order_at
FROM public.customers c
LEFT JOIN public.applications a ON a.customer_id = c.id
LEFT JOIN public.payments p ON p.customer_id = c.id
GROUP BY c.id;
GRANT SELECT ON public.customer_stats TO authenticated, service_role;

-- 10. Sequences + ticket number trigger
CREATE SEQUENCE IF NOT EXISTS public.ticket_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.complaint_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'TKT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('public.ticket_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_ticket_number BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.generate_ticket_number();

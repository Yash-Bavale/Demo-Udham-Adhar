-- Migration: 20260921150000_order_action_logs.sql
-- Purpose: Complete immutable audit log for employee operational actions on orders

CREATE TABLE IF NOT EXISTS public.order_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL,
  employee_role TEXT,
  action_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  previous_stage TEXT,
  new_stage TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at_ist TEXT NOT NULL,
  time_spent_since_assignment_ms BIGINT DEFAULT 0,
  time_spent_since_previous_action_ms BIGINT DEFAULT 0,
  sla_status TEXT NOT NULL DEFAULT 'healthy' CHECK (sla_status IN ('healthy', 'at_risk', 'breached')),
  is_sla_breached BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'employee' CHECK (source IN ('employee', 'admin', 'system', 'customer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lightning-fast aggregated metrics and historical timelines
CREATE INDEX IF NOT EXISTS idx_oal_employee_created ON public.order_action_logs(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oal_order_created ON public.order_action_logs(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oal_action_type ON public.order_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_oal_created_at ON public.order_action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oal_sla ON public.order_action_logs(is_sla_breached, sla_status);
CREATE INDEX IF NOT EXISTS idx_oal_lead_id ON public.order_action_logs(lead_id);

-- Grants
GRANT SELECT, INSERT ON public.order_action_logs TO authenticated;
GRANT ALL ON public.order_action_logs TO service_role;

-- Row Level Security
ALTER TABLE public.order_action_logs ENABLE ROW LEVEL SECURITY;

-- Admins / Super Admins can select all action logs; regular employees can only select their own logs
DROP POLICY IF EXISTS staff_read_order_action_logs ON public.order_action_logs;
CREATE POLICY staff_read_order_action_logs ON public.order_action_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    employee_id = auth.uid()
  );

-- Authenticated staff can insert action logs
DROP POLICY IF EXISTS staff_insert_order_action_logs ON public.order_action_logs;
CREATE POLICY staff_insert_order_action_logs ON public.order_action_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));

-- Immutability rules (Tamper-evident: No updates or deletes allowed)
CREATE OR REPLACE RULE no_update_order_action_logs AS ON UPDATE TO public.order_action_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_delete_order_action_logs AS ON DELETE TO public.order_action_logs DO INSTEAD NOTHING;

-- Backfill initial actions from application_events and applications if empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.order_action_logs LIMIT 1) THEN
    -- Seed from application_events
    INSERT INTO public.order_action_logs (
      order_id,
      lead_id,
      customer_id,
      employee_id,
      employee_name,
      employee_role,
      action_type,
      previous_status,
      new_status,
      previous_stage,
      new_stage,
      timestamp,
      created_at_ist,
      notes,
      source,
      created_at
    )
    SELECT
      ae.application_id,
      ae.lead_id,
      ae.customer_id,
      ae.created_by,
      COALESCE(ae.staff_name, 'Staff'),
      ae.staff_role,
      UPPER(COALESCE(ae.event_type, 'STATUS_CHANGED')),
      ae.old_value,
      ae.new_value,
      ae.old_value,
      ae.new_value,
      COALESCE(ae.created_at, now()),
      to_char(COALESCE(ae.created_at, now()) AT TIME ZONE 'Asia/Kolkata', 'DD/MM/YYYY, HH12:MI AM IST'),
      ae.note,
      CASE WHEN ae.staff_role = 'super_admin' OR ae.staff_role = 'admin' THEN 'admin' ELSE 'employee' END,
      COALESCE(ae.created_at, now())
    FROM public.application_events ae
    WHERE ae.application_id IS NOT NULL;
  END IF;
END $$;

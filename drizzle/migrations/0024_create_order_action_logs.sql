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
  sla_status TEXT NOT NULL DEFAULT 'compliant' CHECK (sla_status IN ('compliant','healthy','at_risk','breached')),
  is_sla_breached BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'employee' CHECK (source IN ('employee','admin','system','customer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oal_employee_created ON public.order_action_logs(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oal_order_created ON public.order_action_logs(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oal_created_at ON public.order_action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oal_lead_id ON public.order_action_logs(lead_id);
GRANT SELECT, INSERT ON public.order_action_logs TO authenticated;
GRANT ALL ON public.order_action_logs TO service_role;
ALTER TABLE public.order_action_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read_order_action_logs ON public.order_action_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role) OR employee_id = auth.uid());
CREATE POLICY staff_insert_order_action_logs ON public.order_action_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE OR REPLACE RULE no_update_order_action_logs AS ON UPDATE TO public.order_action_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_delete_order_action_logs AS ON DELETE TO public.order_action_logs DO INSTEAD NOTHING;
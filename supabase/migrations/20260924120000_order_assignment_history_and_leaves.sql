-- Migration: 20260924120000_order_assignment_history_and_leaves.sql
-- Purpose: Schema for Order Assignment History, Employee Leaves, and Availability Configuration

-- 1. ORDER ASSIGNMENT HISTORY TABLE (Immutable audit trail of every assignment transition)
CREATE TABLE IF NOT EXISTS public.order_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  previous_employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  new_employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'MANUAL',
    'MANUAL_BULK',
    'AUTO_LEAVE',
    'AUTO_UNAVAILABLE',
    'AUTO_INACTIVITY',
    'AUTO_CAPACITY',
    'AUTO_INITIAL_POOL',
    'SYSTEM'
  )),
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('manual', 'system', 'scheduler', 'admin', 'super_admin')),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for lightning-fast queries & filtering
CREATE INDEX IF NOT EXISTS idx_oah_order_id ON public.order_assignment_history(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oah_previous_employee ON public.order_assignment_history(previous_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oah_new_employee ON public.order_assignment_history(new_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oah_change_type ON public.order_assignment_history(change_type);
CREATE INDEX IF NOT EXISTS idx_oah_created_at ON public.order_assignment_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oah_lead_id ON public.order_assignment_history(lead_id);

-- 2. EMPLOYEE LEAVES TABLE
CREATE TABLE IF NOT EXISTS public.employee_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  auto_reassign BOOLEAN NOT NULL DEFAULT true,
  reassigned_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_leaves_emp_time ON public.employee_leaves(employee_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_emp_leaves_status ON public.employee_leaves(status);

-- 3. EMPLOYEE AVAILABILITY CONFIG TABLE
CREATE TABLE IF NOT EXISTS public.employee_availability_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idle_threshold_minutes INT NOT NULL DEFAULT 15,
  offline_threshold_minutes INT NOT NULL DEFAULT 60,
  inactivity_reassign_hours INT NOT NULL DEFAULT 4,
  max_workload_per_employee INT NOT NULL DEFAULT 50,
  auto_reassign_on_leave BOOLEAN NOT NULL DEFAULT true,
  auto_reassign_on_inactivity BOOLEAN NOT NULL DEFAULT false,
  distribution_strategy TEXT NOT NULL DEFAULT 'balanced_workload' CHECK (distribution_strategy IN ('balanced_workload', 'round_robin')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Seed default config row if empty
INSERT INTO public.employee_availability_config (
  idle_threshold_minutes,
  offline_threshold_minutes,
  inactivity_reassign_hours,
  max_workload_per_employee,
  auto_reassign_on_leave,
  auto_reassign_on_inactivity,
  distribution_strategy
)
SELECT 15, 60, 4, 50, true, false, 'balanced_workload'
WHERE NOT EXISTS (SELECT 1 FROM public.employee_availability_config);

-- Grants
GRANT SELECT, INSERT ON public.order_assignment_history TO authenticated;
GRANT ALL ON public.order_assignment_history TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_leaves TO authenticated;
GRANT ALL ON public.employee_leaves TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.employee_availability_config TO authenticated;
GRANT ALL ON public.employee_availability_config TO service_role;

-- Row Level Security
ALTER TABLE public.order_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_availability_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS staff_read_assignment_history ON public.order_assignment_history;
CREATE POLICY staff_read_assignment_history ON public.order_assignment_history FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS staff_insert_assignment_history ON public.order_assignment_history;
CREATE POLICY staff_insert_assignment_history ON public.order_assignment_history FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS staff_read_leaves ON public.employee_leaves;
CREATE POLICY staff_read_leaves ON public.employee_leaves FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS admin_manage_leaves ON public.employee_leaves;
CREATE POLICY admin_manage_leaves ON public.employee_leaves FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS staff_read_availability_config ON public.employee_availability_config;
CREATE POLICY staff_read_availability_config ON public.employee_availability_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS admin_manage_availability_config ON public.employee_availability_config;
CREATE POLICY admin_manage_availability_config ON public.employee_availability_config FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

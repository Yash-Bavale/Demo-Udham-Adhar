-- Migration: 20260924150000_workforce_lifecycle_and_assignment_security.sql
-- Description: Comprehensive Workforce Management, Employee Lifecycle, and Secure Assignment Pool Engine

-- 1. Extend profiles table with Employment Lifecycle, Capacity, Schedule and Auto-Assign fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS auto_assign_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_workload INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS work_schedule JSONB DEFAULT '{"days":[1,2,3,4,5,6],"start_time":"09:30","end_time":"18:30","timezone":"Asia/Kolkata"}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;

-- Backfill employment_status from is_active for legacy profiles
UPDATE public.profiles
   SET employment_status = CASE WHEN is_active = false THEN 'INACTIVE' ELSE 'ACTIVE' END
 WHERE employment_status IS NULL OR employment_status = 'ACTIVE';

-- 2. Ensure order_assignment_history table exists with complete audit columns
CREATE TABLE IF NOT EXISTS public.order_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  lead_id UUID,
  previous_employee_id UUID,
  new_employee_id UUID,
  change_type TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_order_assignment_history_order_id ON public.order_assignment_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_assignment_history_created_at ON public.order_assignment_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_assignment_history_new_emp ON public.order_assignment_history(new_employee_id);
CREATE INDEX IF NOT EXISTS idx_order_assignment_history_prev_emp ON public.order_assignment_history(previous_employee_id);

GRANT SELECT, INSERT ON public.order_assignment_history TO authenticated;
GRANT ALL ON public.order_assignment_history TO service_role;
ALTER TABLE public.order_assignment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read assignment history" ON public.order_assignment_history;
CREATE POLICY "Staff read assignment history" ON public.order_assignment_history
  FOR SELECT TO authenticated USING (true);

-- 3. Ensure employee_leaves table exists
CREATE TABLE IF NOT EXISTS public.employee_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'ANNUAL',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  auto_reassign BOOLEAN NOT NULL DEFAULT true,
  reassigned_count INT NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_leaves_emp_status ON public.employee_leaves(employee_id, status, start_time, end_time);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_leaves TO authenticated;
GRANT ALL ON public.employee_leaves TO service_role;
ALTER TABLE public.employee_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read employee leaves" ON public.employee_leaves;
CREATE POLICY "Staff read employee leaves" ON public.employee_leaves
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage employee leaves" ON public.employee_leaves;
CREATE POLICY "Admins manage employee leaves" ON public.employee_leaves
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin', 'manager'))
  );

-- 4. Authoritative PostgreSQL Function: is_employee_auto_assign_eligible()
-- Single source of truth in the database for whether an employee can receive automatic assignments.
CREATE OR REPLACE FUNCTION public.is_employee_auto_assign_eligible(
  p_user_id uuid,
  p_module text DEFAULT 'work.orders',
  p_service_id uuid DEFAULT NULL,
  p_website_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof record;
  v_now timestamptz := NOW();
  v_now_ist timestamptz := NOW() AT TIME ZONE 'Asia/Kolkata';
  v_dow int := EXTRACT(DOW FROM v_now_ist); -- 0=Sun, 1=Mon, ..., 6=Sat
  v_time_str text := TO_CHAR(v_now_ist, 'HH24:MI');
  v_sched_days jsonb;
  v_start_time text;
  v_end_time text;
  v_active_workload int;
  v_max_workload int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Profile must exist, be ACTIVE, is_active=true, and have auto_assign_enabled=true
  SELECT id, employment_status, is_active, auto_assign_enabled, max_workload, work_schedule
    INTO v_prof
    FROM public.profiles
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_prof.employment_status <> 'ACTIVE' OR v_prof.is_active IS NOT TRUE OR v_prof.auto_assign_enabled IS NOT TRUE THEN
    RETURN false;
  END IF;

  -- 2. Role must be order/lead operational role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = p_user_id
       AND ur.role IN ('operations', 'executive', 'manager', 'admin', 'super_admin', 'support')
  ) THEN
    RETURN false;
  END IF;

  -- 3. Must NOT be on active approved leave
  IF EXISTS (
    SELECT 1 FROM public.employee_leaves el
     WHERE el.employee_id = p_user_id
       AND el.status = 'ACTIVE'
       AND v_now >= el.start_time
       AND v_now <= el.end_time
  ) THEN
    RETURN false;
  END IF;

  -- 4. Working schedule check (if schedule is defined)
  IF v_prof.work_schedule IS NOT NULL THEN
    v_sched_days := v_prof.work_schedule->'days';
    v_start_time := COALESCE(v_prof.work_schedule->>'start_time', '09:00');
    v_end_time   := COALESCE(v_prof.work_schedule->>'end_time', '19:00');

    -- If working days specified and today is not in working days
    IF v_sched_days IS NOT NULL AND jsonb_array_length(v_sched_days) > 0 THEN
      IF NOT (v_sched_days @> to_jsonb(v_dow)) THEN
        RETURN false;
      END IF;
    END IF;

    -- Time bounds check
    IF v_start_time IS NOT NULL AND v_end_time IS NOT NULL THEN
      IF v_time_str < v_start_time OR v_time_str > v_end_time THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  -- 5. Capacity check: count open active orders
  v_max_workload := COALESCE(v_prof.max_workload, 50);
  SELECT COUNT(*)
    INTO v_active_workload
    FROM public.applications a
   WHERE a.assigned_to = p_user_id
     AND a.is_deleted = false
     AND a.fulfillment_status NOT IN ('completed', 'order_completed', 'order_closed', 'cancelled', 'application_rejected', 'certificate_rejected')
     AND COALESCE(a.application_status, '') NOT IN ('completed', 'closed', 'cancelled');

  IF v_active_workload >= v_max_workload THEN
    RETURN false;
  END IF;

  -- 6. Permissions and Scopes check
  IF EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = p_user_id AND up.module_key = p_module) THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = p_user_id AND up.module_key = p_module AND up.can_view = true) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_website_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_permission_scopes s WHERE s.user_id = p_user_id AND s.module_key = p_module AND s.website_id IS NOT NULL
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_permission_scopes s WHERE s.user_id = p_user_id AND s.module_key = p_module AND s.website_id = p_website_id
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_service_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_permission_scopes s WHERE s.user_id = p_user_id AND s.module_key = p_module AND s.service_id IS NOT NULL
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_permission_scopes s WHERE s.user_id = p_user_id AND s.module_key = p_module AND s.service_id = p_service_id
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- 5. SECURED assign_pool_pick() FUNCTION
-- Completely replaces legacy unprotected round-robin with strict workforce eligibility enforcement.
CREATE OR REPLACE FUNCTION public.assign_pool_pick(_service_id uuid, _website_id uuid, _module text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_id uuid;
  v_user uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('assignment_pool:' || _module, 0));

  -- Pick next eligible employee ordered by lowest workload & round-robin timestamp
  SELECT ap.id, ap.user_id INTO v_pool_id, v_user
    FROM public.assignment_pool ap
   WHERE ap.is_active = true
     AND (ap.service_id = _service_id OR ap.service_id IS NULL)
     AND public.is_employee_auto_assign_eligible(ap.user_id, _module, _service_id, _website_id) = true
   ORDER BY (ap.service_id IS NULL) ASC,
            CASE WHEN _module = 'work.orders' THEN ap.last_order_assigned_at ELSE ap.last_lead_assigned_at END ASC NULLS FIRST,
            CASE WHEN _module = 'work.orders' THEN ap.total_orders_assigned ELSE ap.total_leads_assigned END ASC,
            ap.id ASC
   LIMIT 1
   FOR UPDATE;

  -- If no employee passes all eligibility checks, return NULL (leaves order unassigned / safe)
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  -- Record assignment timestamp and increment pool metrics
  UPDATE public.assignment_pool
     SET last_assigned_at = clock_timestamp(),
         total_assigned = total_assigned + 1,
         last_order_assigned_at = CASE WHEN _module = 'work.orders' THEN clock_timestamp() ELSE last_order_assigned_at END,
         last_lead_assigned_at  = CASE WHEN _module = 'work.orders' THEN last_lead_assigned_at  ELSE clock_timestamp() END,
         total_orders_assigned  = total_orders_assigned + CASE WHEN _module = 'work.orders' THEN 1 ELSE 0 END,
         total_leads_assigned   = total_leads_assigned  + CASE WHEN _module = 'work.orders' THEN 0 ELSE 1 END
   WHERE id = v_pool_id;

  RETURN v_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_pool_pick(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_pool_pick(uuid, uuid, text) TO service_role;

-- 6. Safe Data Reconciliation of Existing Assignment Pool
-- Sync profiles.auto_assign_enabled with assignment_pool.is_active for active staff only.
UPDATE public.profiles p
   SET auto_assign_enabled = true
 WHERE p.employment_status = 'ACTIVE'
   AND p.is_active = true
   AND EXISTS (SELECT 1 FROM public.assignment_pool ap WHERE ap.user_id = p.id AND ap.is_active = true);

-- Disable pool entries for inactive or archived accounts
UPDATE public.assignment_pool ap
   SET is_active = false
 WHERE EXISTS (
   SELECT 1 FROM public.profiles p
    WHERE p.id = ap.user_id
      AND (p.employment_status <> 'ACTIVE' OR p.is_active = false)
 );

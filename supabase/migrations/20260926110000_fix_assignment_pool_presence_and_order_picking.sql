-- Migration: Fix Assignment Pool Presence & Equal Round-Robin Order Picking
-- Removes session heartbeat / offline gating and guarantees fair round-robin distribution across all active pool staff.

-- 1. Redefine is_employee_auto_assign_eligible without session heartbeat requirements
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
  v_now timestamptz := clock_timestamp();
  v_dow int := EXTRACT(DOW FROM v_now AT TIME ZONE 'Asia/Kolkata');
  v_time_str text := to_char(v_now AT TIME ZONE 'Asia/Kolkata', 'HH24:MI');
  v_sched_days jsonb;
  v_start_time text;
  v_end_time text;
  v_active_workload int;
  v_max_workload int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Profile must exist, be ACTIVE, is_active != false, and not disabled
  SELECT id, employment_status, is_active, auto_assign_enabled, max_workload, work_schedule
    INTO v_prof
    FROM public.profiles
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(v_prof.employment_status, 'ACTIVE') NOT IN ('ACTIVE') 
     OR v_prof.is_active IS FALSE 
     OR v_prof.auto_assign_enabled IS FALSE THEN
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

  -- 4. Working schedule check (IST timezone)
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

    -- Time bounds check in IST
    IF v_start_time IS NOT NULL AND v_end_time IS NOT NULL THEN
      IF v_time_str < v_start_time OR v_time_str > v_end_time THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  -- 5. Capacity check: count open active orders against max_workload
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

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_employee_auto_assign_eligible(uuid, text, uuid, uuid) TO authenticated, service_role;


-- 2. Redefine assign_pool_pick for true round-robin picking
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

  -- Pick candidate by round-robin timestamp among active, eligible pool members
  SELECT ap.id, ap.user_id INTO v_pool_id, v_user
    FROM public.assignment_pool ap
   WHERE ap.is_active = true
     AND (ap.service_id = _service_id OR ap.service_id IS NULL)
     AND public.is_employee_auto_assign_eligible(ap.user_id, _module, _service_id, _website_id) = true
   ORDER BY (ap.service_id IS NULL) ASC,
            CASE WHEN _module = 'work.orders' THEN ap.last_order_assigned_at ELSE ap.last_lead_assigned_at END ASC NULLS FIRST,
            ap.last_assigned_at ASC NULLS FIRST,
            ap.id ASC
   LIMIT 1
   FOR UPDATE;

  -- Fallback: Pick any active pool member if specific service/module filter yielded no match
  IF v_user IS NULL THEN
    SELECT ap.id, ap.user_id INTO v_pool_id, v_user
      FROM public.assignment_pool ap
     WHERE ap.is_active = true
     ORDER BY ap.last_assigned_at ASC NULLS FIRST, ap.id ASC
     LIMIT 1
     FOR UPDATE;
  END IF;

  -- If pool is empty, return NULL safely
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

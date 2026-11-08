-- Migration: 20260924160000_secure_presence_and_workload_assignment.sql
-- Description: Enforce Real-time Presence, Session Heartbeat, and Unified Weighted Workload in PostgreSQL Auto-Assignment

-- 1. Optimized Indices for High-Frequency Assignment and Presence Evaluation
CREATE INDEX IF NOT EXISTS idx_emp_sessions_presence_check 
  ON public.employee_sessions(employee_id, is_active, last_heartbeat_at DESC, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_workload_eval
  ON public.applications(assigned_to, is_deleted, fulfillment_status, application_status);

CREATE INDEX IF NOT EXISTS idx_order_schedulers_active_due
  ON public.order_schedulers(application_id, status, fires_at);

-- 2. PostgreSQL Helper: get_employee_effective_workload()
-- Evaluates exact weighted workload identical to TypeScript engine:
-- Normal = 1.0, Hot / Reopened / Due Callback = 2.0, Tech Delay = 1.5
CREATE OR REPLACE FUNCTION public.get_employee_effective_workload(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE 
      WHEN a.fulfillment_status = 'order_reopened' OR a.application_status = 'order_reopened' THEN 2.0
      WHEN a.fulfillment_status = 'technical_delay' OR a.application_status = 'technical_delay' THEN 1.5
      WHEN EXISTS (
        SELECT 1 FROM public.order_schedulers os
         WHERE os.application_id = a.id
           AND os.status = 'active'
           AND os.fires_at <= NOW()
      ) THEN 2.0
      ELSE 1.0
    END
  ), 0.0)
  FROM public.applications a
 WHERE a.assigned_to = p_user_id
   AND a.is_deleted = false
   AND a.fulfillment_status NOT IN ('completed', 'order_completed', 'order_closed', 'cancelled', 'application_rejected', 'certificate_rejected')
   AND COALESCE(a.application_status, '') NOT IN ('completed', 'closed', 'cancelled');
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_effective_workload(uuid) TO authenticated, service_role;

-- 3. Authoritative PostgreSQL Function: is_employee_auto_assign_eligible()
-- Enforces: Active Profile + Role + Auto Assign Flag + No Leave + Working Hours + Capacity + Active Presence / Heartbeat
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

  -- 5. Real-time Presence & Session Heartbeat Check:
  -- Must have a valid session with heartbeat within 5 minutes AND user activity within 15 minutes.
  -- Employees who are OFFLINE (heartbeat > 5m) or AWAY (activity > 15m) are ineligible for NEW orders.
  -- Short IDLE (activity 5-15m with heartbeat alive) remains ELIGIBLE.
  IF NOT EXISTS (
    SELECT 1 FROM public.employee_sessions es
     WHERE es.employee_id = p_user_id
       AND es.is_active = true
       AND es.status NOT IN ('logged_out', 'force_logged_out', 'expired', 'away')
       AND es.last_heartbeat_at >= (v_now - INTERVAL '5 minutes')
       AND es.last_activity_at >= (v_now - INTERVAL '15 minutes')
  ) THEN
    RETURN false;
  END IF;

  -- 6. Capacity check: count open active orders against max_workload
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

  -- 7. Permissions and Scopes check
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

GRANT EXECUTE ON FUNCTION public.is_employee_auto_assign_eligible(uuid, text, uuid, uuid) TO authenticated, service_role;

-- 4. Workload-Balanced assign_pool_pick() Function
-- Picks candidate with LOWEST EFFECTIVE WORKLOAD among strictly eligible employees
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

  -- Pick candidate with lowest weighted workload among strictly eligible, online, available staff
  SELECT ap.id, ap.user_id INTO v_pool_id, v_user
    FROM public.assignment_pool ap
   WHERE ap.is_active = true
     AND (ap.service_id = _service_id OR ap.service_id IS NULL)
     AND public.is_employee_auto_assign_eligible(ap.user_id, _module, _service_id, _website_id) = true
   ORDER BY (ap.service_id IS NULL) ASC,
            public.get_employee_effective_workload(ap.user_id) ASC,
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

-- 5. Production pg_cron Job Registration for Automated Workforce Presence & Reassignment Tick
DO $$
DECLARE
  v_url text := 'https://project--b9dc2e49-0e43-4d3d-84b6-7e29ce7bb6d7.lovable.app/api/public/cron/workforce-reassign-tick';
  v_cron_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_cron_secret := NULL; END;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workforce-reassign-tick') THEN
    PERFORM cron.unschedule('workforce-reassign-tick');
  END IF;

  PERFORM cron.schedule(
    'workforce-reassign-tick',
    '*/5 * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization', %L),
        body := '{}'::jsonb
      );$cmd$,
      v_url,
      'Bearer ' || COALESCE(v_cron_secret, '')
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- In development or environments where pg_net / pg_cron is disabled, ignore gracefully
  NULL;
END $$;

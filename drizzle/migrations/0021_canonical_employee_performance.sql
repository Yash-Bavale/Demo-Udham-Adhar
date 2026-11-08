
-- Phase 1: record assignment history for new orders (INSERT) and typed transitions (UPDATE).
CREATE OR REPLACE FUNCTION public.log_application_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_name TEXT := 'System';
  v_staff_role TEXT := 'system';
  v_uid uuid := auth.uid();
  v_type TEXT;
BEGIN
  BEGIN
    SELECT COALESCE(p.display_name, p.email, 'Staff'), COALESCE(ur.role::TEXT, 'staff')
      INTO v_staff_name, v_staff_role
      FROM public.profiles p
      LEFT JOIN public.user_roles ur ON ur.user_id = v_uid
     WHERE p.id = v_uid
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  v_staff_name := COALESCE(v_staff_name, 'System');
  v_staff_role := COALESCE(v_staff_role, 'system');

  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      v_type := CASE WHEN COALESCE(NEW.auto_assigned, false) OR v_uid IS NULL
                     THEN 'AUTO_ASSIGNMENT' ELSE 'INITIAL_ASSIGNMENT' END;
      INSERT INTO public.application_events
        (application_id, lead_id, customer_id, event_type, old_value, new_value, note, created_by, staff_name, staff_role, created_at)
      VALUES
        (NEW.id, NEW.lead_id, NEW.customer_id, 'assignment_change',
         NULL, NEW.assigned_to::TEXT, 'assignment_type=' || v_type || ';initial=true',
         CASE WHEN v_type = 'AUTO_ASSIGNMENT' THEN NULL ELSE v_uid END,
         CASE WHEN v_type = 'AUTO_ASSIGNMENT' THEN 'Auto-Assign' ELSE v_staff_name END,
         CASE WHEN v_type = 'AUTO_ASSIGNMENT' THEN 'system' ELSE v_staff_role END,
         COALESCE(NEW.assigned_at, now()));
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status THEN
    INSERT INTO public.application_events
      (application_id, lead_id, customer_id, event_type, old_value, new_value, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.lead_id, NEW.customer_id, 'status_change',
       OLD.fulfillment_status::TEXT, NEW.fulfillment_status::TEXT,
       v_uid, v_staff_name, v_staff_role);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    v_type := CASE
      WHEN NEW.assigned_to IS NULL THEN 'UNASSIGNMENT'
      WHEN OLD.assigned_to IS NULL AND v_uid IS NOT NULL THEN 'MANUAL_ASSIGNMENT'
      WHEN OLD.assigned_to IS NULL THEN 'AUTO_ASSIGNMENT'
      WHEN v_uid IS NOT NULL THEN 'REASSIGNMENT'
      ELSE 'SYSTEM_REBALANCE' END;
    INSERT INTO public.application_events
      (application_id, lead_id, customer_id, event_type, old_value, new_value, note, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.lead_id, NEW.customer_id, 'assignment_change',
       OLD.assigned_to::TEXT, NEW.assigned_to::TEXT, 'assignment_type=' || v_type,
       v_uid, v_staff_name, v_staff_role);
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_application_events ON public.applications;
CREATE TRIGGER trg_application_events
  AFTER INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.log_application_event();

-- Indexes for order-level performance lookups (lead-level rows excluded).
CREATE INDEX IF NOT EXISTS idx_app_events_perf_actor
  ON public.application_events (created_by, created_at DESC) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_events_perf_type
  ON public.application_events (event_type, created_at DESC) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_events_app_time
  ON public.application_events (application_id, created_at) WHERE application_id IS NOT NULL;

-- Phase 2: one canonical event stream. Every KPI and every drilldown is derived from it.
CREATE OR REPLACE FUNCTION public.get_employee_perf_stream(
  p_from timestamptz, p_to timestamptz, p_employee uuid DEFAULT NULL)
RETURNS TABLE(
  kind text, employee_id uuid, application_id uuid, event_id uuid, event_type text,
  occurred_at timestamptz, old_assignee uuid, new_assignee uuid, initiator uuid,
  assignment_type text, attribution text, new_value text, note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_mgr boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_is_mgr := public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin') OR public.has_role(v_uid,'manager');
  IF NOT v_is_mgr THEN
    IF NOT public.has_any_staff_role(v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
    p_employee := v_uid; -- non-managers can only see themselves
  END IF;
  IF p_to <= p_from OR p_to - p_from > interval '400 days' THEN RAISE EXCEPTION 'invalid range'; END IF;

  RETURN QUERY
  WITH staff AS (SELECT DISTINCT ur.user_id FROM public.user_roles ur),
  unique_names AS (
    SELECT p.display_name, (array_agg(p.id))[1] AS id
      FROM public.profiles p WHERE p.display_name IS NOT NULL
     GROUP BY p.display_name HAVING count(*) = 1),
  ev AS (
    SELECT e.* FROM public.application_events e
     WHERE e.application_id IS NOT NULL AND e.created_at >= p_from AND e.created_at < p_to),
  -- Human operational actions
  human AS (
    SELECT e.id, e.application_id, e.event_type, e.created_at, e.new_value, e.note,
           COALESCE(e.created_by, un.id) AS actor,
           CASE WHEN e.created_by IS NOT NULL THEN 'created_by' ELSE 'staff_name' END AS attribution
      FROM ev e
      LEFT JOIN unique_names un ON e.created_by IS NULL AND e.staff_role IS DISTINCT FROM 'system' AND un.display_name = e.staff_name
     WHERE (
        (e.event_type IN ('document_uploaded','application_completed','callback_scheduled','callback_rescheduled',
                          'callback_completed','callback_cancelled','technical_delay_marked','technical_delay_reminder_scheduled',
                          'service_changed','note_added','hot_priority_escalated','consultation_completed','contact_logged',
                          'lead_status_change','customer_delay_marked','order_reopened'))
        OR (e.event_type = 'order_status_change' AND e.created_by IS NOT NULL)
     )),
  human_ok AS (SELECT h.* FROM human h JOIN staff s ON s.user_id = h.actor),
  -- Assignment transitions recorded as events
  asg AS (
    SELECT e.id, e.application_id, e.created_at, NULLIF(e.old_value,'')::uuid AS old_a, NULLIF(e.new_value,'')::uuid AS new_a,
           e.created_by, COALESCE(substring(e.note from 'assignment_type=([A-Z_]+)'),
             CASE WHEN e.old_value IS NULL THEN 'ASSIGNMENT' WHEN e.new_value IS NULL THEN 'UNASSIGNMENT' ELSE 'REASSIGNMENT' END) AS atype,
           CASE WHEN e.note LIKE 'assignment_type=%' THEN 'event' ELSE 'legacy_event' END AS attribution
      FROM ev e WHERE e.event_type = 'assignment_change'),
  -- Legacy initial assignment (orders with no recorded initial event): reconstructed conservatively.
  legacy_init AS (
    SELECT a.id AS application_id, a.created_at AS at_time,
           COALESCE(
             (SELECT NULLIF(f.old_value,'')::uuid FROM public.application_events f
               WHERE f.application_id = a.id AND f.event_type='assignment_change' ORDER BY f.created_at ASC LIMIT 1),
             CASE WHEN NOT EXISTS (SELECT 1 FROM public.application_events f2 WHERE f2.application_id=a.id AND f2.event_type='assignment_change')
                  THEN a.assigned_to END) AS new_a,
           a.auto_assigned
      FROM public.applications a
     WHERE a.created_at >= p_from AND a.created_at < p_to
       AND NOT EXISTS (SELECT 1 FROM public.application_events f3
                        WHERE f3.application_id = a.id AND f3.event_type='assignment_change' AND f3.note LIKE '%initial=true%'))
  SELECT 'assignment'::text, x.new_a, x.application_id, x.id, 'assignment_change'::text, x.created_at,
         x.old_a, x.new_a, x.created_by, x.atype, x.attribution, NULL::text, NULL::text
    FROM asg x WHERE x.new_a IS NOT NULL AND (p_employee IS NULL OR x.new_a = p_employee)
  UNION ALL
  SELECT 'unassignment'::text, x.old_a, x.application_id, x.id, 'assignment_change', x.created_at,
         x.old_a, x.new_a, x.created_by, x.atype, x.attribution, NULL, NULL
    FROM asg x WHERE x.old_a IS NOT NULL AND x.old_a IS DISTINCT FROM x.new_a AND (p_employee IS NULL OR x.old_a = p_employee)
  UNION ALL
  SELECT 'assignment', l.new_a, l.application_id, NULL::uuid, 'legacy_initial_assignment', l.at_time,
         NULL::uuid, l.new_a, NULL::uuid, CASE WHEN l.auto_assigned THEN 'AUTO_ASSIGNMENT' ELSE 'INITIAL_ASSIGNMENT' END,
         'legacy_reconstructed', NULL, NULL
    FROM legacy_init l WHERE l.new_a IS NOT NULL AND (p_employee IS NULL OR l.new_a = p_employee)
  UNION ALL
  SELECT CASE
           WHEN h.event_type = 'application_completed' THEN 'completion'
           WHEN h.event_type = 'order_status_change' AND upper(h.new_value) = 'CLOSED' THEN 'closure'
           ELSE 'action' END,
         h.actor, h.application_id, h.id, h.event_type, h.created_at,
         NULL, NULL, h.actor, NULL, h.attribution, h.new_value, left(h.note, 300)
    FROM human_ok h WHERE (p_employee IS NULL OR h.actor = p_employee);
END $$;

REVOKE ALL ON FUNCTION public.get_employee_perf_stream(timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_perf_stream(timestamptz, timestamptz, uuid) TO authenticated;

-- Last human action per employee (all time), same classification as the stream.
CREATE OR REPLACE FUNCTION public.get_employee_last_human_action(p_employees uuid[])
RETURNS TABLE(employee_id uuid, last_action_at timestamptz, event_type text, application_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin') OR public.has_role(v_uid,'manager')) THEN
    p_employees := ARRAY[v_uid];
  END IF;
  RETURN QUERY
  WITH unique_names AS (
    SELECT p.display_name, (array_agg(p.id))[1] AS id FROM public.profiles p
     WHERE p.display_name IS NOT NULL GROUP BY p.display_name HAVING count(*) = 1),
  h AS (
    SELECT COALESCE(e.created_by, un.id) AS actor, e.created_at, e.event_type, e.application_id
      FROM public.application_events e
      LEFT JOIN unique_names un ON e.created_by IS NULL AND e.staff_role IS DISTINCT FROM 'system' AND un.display_name = e.staff_name
     WHERE e.application_id IS NOT NULL
       AND (e.event_type IN ('document_uploaded','application_completed','callback_scheduled','callback_rescheduled',
                          'callback_completed','callback_cancelled','technical_delay_marked','technical_delay_reminder_scheduled',
                          'service_changed','note_added','hot_priority_escalated','consultation_completed','contact_logged',
                          'lead_status_change','customer_delay_marked','order_reopened')
            OR (e.event_type = 'order_status_change' AND e.created_by IS NOT NULL)))
  SELECT DISTINCT ON (h.actor) h.actor, h.created_at, h.event_type, h.application_id
    FROM h WHERE h.actor = ANY(p_employees)
   ORDER BY h.actor, h.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.get_employee_last_human_action(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_last_human_action(uuid[]) TO authenticated;

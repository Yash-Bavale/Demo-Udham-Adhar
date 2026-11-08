CREATE OR REPLACE FUNCTION public.get_employee_perf_stream(p_from timestamp with time zone, p_to timestamp with time zone, p_employee uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kind text, employee_id uuid, application_id uuid, event_id uuid, event_type text, occurred_at timestamp with time zone, old_assignee uuid, new_assignee uuid, initiator uuid, assignment_type text, attribution text, new_value text, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_mgr boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_is_mgr := public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin') OR public.has_role(v_uid,'manager');
  IF NOT v_is_mgr THEN
    IF NOT public.has_any_staff_role(v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
    p_employee := v_uid;
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
  asg AS (
    SELECT e.id, e.application_id, e.created_at, NULLIF(e.old_value,'')::uuid AS old_a, NULLIF(e.new_value,'')::uuid AS new_a,
           e.created_by, COALESCE(substring(e.note from 'assignment_type=([A-Z_]+)'),
             CASE WHEN e.old_value IS NULL THEN 'ASSIGNMENT' WHEN e.new_value IS NULL THEN 'UNASSIGNMENT' ELSE 'REASSIGNMENT' END) AS atype,
           CASE WHEN e.note LIKE 'assignment_type=%' THEN 'event' ELSE 'legacy_event' END AS attribution
      FROM ev e WHERE e.event_type = 'assignment_change'),
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
    FROM human_ok h WHERE (p_employee IS NULL OR h.actor = p_employee)
  ORDER BY 6, 1, 3, 4;
END $function$;
-- Migration: Auto-remove archived staff from assignment pool & prevent assignment to toggled-off pool members

-- 1. Database trigger: Automatically remove archived or deactivated employees from assignment_pool
CREATE OR REPLACE FUNCTION public.clean_archived_employee_from_assignment_pool()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employment_status IN ('ARCHIVED', 'TERMINATED') OR NEW.is_active IS FALSE THEN
    DELETE FROM public.assignment_pool WHERE user_id = NEW.id;
    NEW.auto_assign_enabled := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_archived_employee_from_assignment_pool ON public.profiles;
CREATE TRIGGER trg_clean_archived_employee_from_assignment_pool
  BEFORE INSERT OR UPDATE OF employment_status, is_active
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.clean_archived_employee_from_assignment_pool();

-- 2. Immediate One-Time Purge of existing archived/inactive profiles from assignment_pool
DELETE FROM public.assignment_pool
 WHERE user_id IN (
   SELECT id FROM public.profiles
    WHERE employment_status IN ('ARCHIVED', 'TERMINATED')
       OR is_active IS FALSE
 );

-- Also sync profiles.auto_assign_enabled to false for any archived/inactive accounts
UPDATE public.profiles
   SET auto_assign_enabled = false
 WHERE employment_status IN ('ARCHIVED', 'TERMINATED')
    OR is_active IS FALSE;

-- 3. Hardened assign_pool_pick function:
-- Guarantees that fallback NEVER picks anyone who is not active or not auto-assign eligible
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

  -- Fallback: Pick any active pool member who passes eligibility if specific service filter yielded no match
  IF v_user IS NULL THEN
    SELECT ap.id, ap.user_id INTO v_pool_id, v_user
      FROM public.assignment_pool ap
     WHERE ap.is_active = true
       AND public.is_employee_auto_assign_eligible(ap.user_id, _module, NULL, _website_id) = true
     ORDER BY ap.last_assigned_at ASC NULLS FIRST, ap.id ASC
     LIMIT 1
     FOR UPDATE;
  END IF;

  -- If pool has no eligible active member, return NULL safely (order stays unassigned)
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

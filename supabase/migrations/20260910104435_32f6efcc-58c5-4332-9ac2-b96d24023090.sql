
-- Shared round-robin picker: locks the chosen pool row so concurrent inserts
-- cannot pick the same employee twice.
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
  SELECT ap.id, ap.user_id INTO v_pool_id, v_user
    FROM public.assignment_pool ap
   WHERE ap.is_active = true
     AND (ap.service_id = _service_id OR ap.service_id IS NULL)
     AND (
       NOT EXISTS (SELECT 1 FROM public.user_permissions up
                    WHERE up.user_id = ap.user_id AND up.module_key = _module)
       OR EXISTS (SELECT 1 FROM public.user_permissions up
                   WHERE up.user_id = ap.user_id AND up.module_key = _module
                     AND up.can_view = true)
     )
     AND (
       NOT EXISTS (SELECT 1 FROM public.user_permission_scopes s
                    WHERE s.user_id = ap.user_id AND s.module_key = _module
                      AND s.website_id IS NOT NULL)
       OR _website_id IS NULL
       OR EXISTS (SELECT 1 FROM public.user_permission_scopes s
                   WHERE s.user_id = ap.user_id AND s.module_key = _module
                     AND s.website_id = _website_id)
     )
     AND (
       NOT EXISTS (SELECT 1 FROM public.user_permission_scopes s
                    WHERE s.user_id = ap.user_id AND s.module_key = _module
                      AND s.service_id IS NOT NULL)
       OR _service_id IS NULL
       OR EXISTS (SELECT 1 FROM public.user_permission_scopes s
                   WHERE s.user_id = ap.user_id AND s.module_key = _module
                     AND s.service_id = _service_id)
     )
   ORDER BY (ap.service_id IS NULL) ASC,
            ap.last_assigned_at ASC NULLS FIRST,
            ap.total_assigned ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_user IS NULL THEN RETURN NULL; END IF;

  UPDATE public.assignment_pool
     SET last_assigned_at = clock_timestamp(), total_assigned = total_assigned + 1
   WHERE id = v_pool_id;

  RETURN v_user;
END;
$$;

-- Records a turn for an employee who received work without going through the picker
-- (e.g. an order inheriting its lead's owner), so they move to the back of the queue.
CREATE OR REPLACE FUNCTION public.assign_pool_touch(_user_id uuid, _service_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.assignment_pool
     SET last_assigned_at = clock_timestamp(), total_assigned = total_assigned + 1
   WHERE id = (
     SELECT id FROM public.assignment_pool
      WHERE user_id = _user_id AND is_active = true
        AND (service_id = _service_id OR service_id IS NULL)
      ORDER BY (service_id IS NULL) ASC
      LIMIT 1
   );
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_next UUID;
  v_lead_owner UUID;
  v_lead_owner_in_pool UUID;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;

  SELECT is_active INTO v_enabled
    FROM public.lead_assignment_config
   WHERE service_id IS NULL
   LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN RETURN NEW; END IF;

  -- Inherit from parent lead if that employee is in an active pool entry
  IF NEW.lead_id IS NOT NULL THEN
    SELECT assigned_to INTO v_lead_owner FROM public.leads WHERE id = NEW.lead_id;
    IF v_lead_owner IS NOT NULL THEN
      SELECT user_id INTO v_lead_owner_in_pool
        FROM public.assignment_pool
       WHERE user_id = v_lead_owner
         AND is_active = true
         AND (service_id = NEW.service_id OR service_id IS NULL)
       LIMIT 1;
      IF v_lead_owner_in_pool IS NOT NULL THEN
        NEW.assigned_to := v_lead_owner;
        NEW.assigned_at := now();
        NEW.auto_assigned := true;
        PERFORM public.assign_pool_touch(v_lead_owner, NEW.service_id);
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  v_next := public.assign_pool_pick(NEW.service_id, NEW.website_id, 'work.orders');
  IF v_next IS NOT NULL THEN
    NEW.assigned_to := v_next;
    NEW.assigned_at := now();
    NEW.auto_assigned := true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_next UUID;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;

  SELECT is_active INTO v_enabled
    FROM public.lead_assignment_config
   WHERE service_id IS NULL
   LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN RETURN NEW; END IF;

  v_next := public.assign_pool_pick(NEW.service_id, NEW.website_id, 'work.leads');
  IF v_next IS NOT NULL THEN
    NEW.assigned_to := v_next;
    NEW.assigned_at := now();
    NEW.auto_assigned := true;
  END IF;

  RETURN NEW;
END;
$$;

-- Reset inflated counters to the real workload
UPDATE public.assignment_pool ap
   SET total_assigned = COALESCE((SELECT count(*) FROM public.leads l WHERE l.assigned_to = ap.user_id), 0)
                      + COALESCE((SELECT count(*) FROM public.applications a WHERE a.assigned_to = ap.user_id), 0);

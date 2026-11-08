ALTER TABLE public.assignment_pool
  ADD COLUMN IF NOT EXISTS last_lead_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_order_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_leads_assigned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_orders_assigned integer NOT NULL DEFAULT 0;

UPDATE public.assignment_pool ap
SET total_leads_assigned = COALESCE((SELECT count(*) FROM public.leads l WHERE l.assigned_to = ap.user_id), 0),
    total_orders_assigned = COALESCE((SELECT count(*) FROM public.applications a WHERE a.assigned_to = ap.user_id), 0),
    last_lead_assigned_at = NULL,
    last_order_assigned_at = NULL;

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
            CASE WHEN _module = 'work.orders' THEN ap.last_order_assigned_at ELSE ap.last_lead_assigned_at END ASC NULLS FIRST,
            CASE WHEN _module = 'work.orders' THEN ap.total_orders_assigned ELSE ap.total_leads_assigned END ASC,
            ap.id ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_user IS NULL THEN RETURN NULL; END IF;

  UPDATE public.assignment_pool
     SET last_assigned_at = clock_timestamp(),
         total_assigned = total_assigned + 1,
         last_order_assigned_at = CASE WHEN _module = 'work.orders' THEN clock_timestamp() ELSE last_order_assigned_at END,
         last_lead_assigned_at = CASE WHEN _module = 'work.orders' THEN last_lead_assigned_at ELSE clock_timestamp() END,
         total_orders_assigned = total_orders_assigned + CASE WHEN _module = 'work.orders' THEN 1 ELSE 0 END,
         total_leads_assigned = total_leads_assigned + CASE WHEN _module = 'work.orders' THEN 0 ELSE 1 END
   WHERE id = v_pool_id;

  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_next uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;

  SELECT is_active INTO v_enabled
    FROM public.lead_assignment_config
   WHERE service_id IS NULL
   LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN RETURN NEW; END IF;

  v_next := public.assign_pool_pick(NEW.service_id, NEW.website_id, 'work.orders');
  IF v_next IS NOT NULL THEN
    NEW.assigned_to := v_next;
    NEW.assigned_at := now();
    NEW.auto_assigned := true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_pool_pick(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_pool_pick(uuid, uuid, text) TO service_role;
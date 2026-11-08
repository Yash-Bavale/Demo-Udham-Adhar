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
   FOR UPDATE;

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

REVOKE EXECUTE ON FUNCTION public.assign_pool_pick(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_pool_pick(uuid, uuid, text) TO service_role;
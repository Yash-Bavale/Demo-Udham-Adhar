DO $repair$
DECLARE
  v_function_oid oid;
  v_definition text;
BEGIN
  SELECT p.oid INTO v_function_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_orders_v3_paged' AND p.pronargs = 18;

  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'public.get_orders_v3_paged was not found';
  END IF;

  SELECT pg_get_functiondef(v_function_oid) INTO v_definition;
  v_definition := replace(v_definition, 'COALESCE(a.fulfillment_status, '''') NOT IN', 'COALESCE(a.fulfillment_status::text, '''') NOT IN');
  v_definition := replace(v_definition, 'COALESCE(a.application_status, '''') NOT IN', 'COALESCE(a.application_status::text, '''') NOT IN');
  v_definition := replace(v_definition, 'COALESCE(a.order_status, '''') NOT IN', 'COALESCE(a.order_status::text, '''') NOT IN');
  v_definition := replace(v_definition, 'COALESCE(a.workflow_status, '''') NOT IN', 'COALESCE(a.workflow_status::text, '''') NOT IN');
  EXECUTE v_definition;
END
$repair$;

GRANT EXECUTE ON FUNCTION public.get_orders_v3_paged TO authenticated, anon, service_role, postgres;
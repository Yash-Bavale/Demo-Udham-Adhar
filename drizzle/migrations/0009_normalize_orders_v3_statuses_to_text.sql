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
  v_definition := regexp_replace(v_definition, E'      COALESCE\\(a\\.fulfillment_status, ''order_received''\\) AS fulfillment_status,', '      COALESCE(a.fulfillment_status::text, ''order_received'') AS fulfillment_status,');
  v_definition := regexp_replace(v_definition, E'      a\\.application_status,', '      a.application_status::text AS application_status,');
  v_definition := regexp_replace(v_definition, E'      a\\.workflow_status,', '      a.workflow_status::text AS workflow_status,');
  v_definition := regexp_replace(v_definition, E'      a\\.closure_stage,', '      a.closure_stage::text AS closure_stage,');
  v_definition := regexp_replace(v_definition, E'      a\\.order_status,', '      a.order_status::text AS order_status,');
  EXECUTE v_definition;
END
$repair$;

GRANT EXECUTE ON FUNCTION public.get_orders_v3_paged TO authenticated, anon, service_role, postgres;
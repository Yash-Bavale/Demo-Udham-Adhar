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
  v_definition := replace(v_definition,
    'WHEN bc.closure_stage IS NOT NULL THEN bc.closure_stage',
    'WHEN bc.closure_stage IS NOT NULL AND bc.closure_stage <> ''none'' THEN bc.closure_stage');
  v_definition := replace(v_definition,
    'OR bc.closure_stage IS NOT NULL',
    'OR (bc.closure_stage IS NOT NULL AND bc.closure_stage <> ''none'')');
  EXECUTE v_definition;
END
$repair$;

GRANT EXECUTE ON FUNCTION public.get_orders_v3_paged TO authenticated, anon, service_role, postgres;
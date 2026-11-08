REVOKE EXECUTE ON FUNCTION public.auto_assign_application() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_assign_application() TO service_role;
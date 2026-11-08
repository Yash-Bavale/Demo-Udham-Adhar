GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_any_staff_role(uuid) TO authenticated, anon;
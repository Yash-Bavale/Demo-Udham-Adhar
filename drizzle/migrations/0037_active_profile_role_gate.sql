CREATE OR REPLACE FUNCTION public.is_account_disabled(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND (p.is_active IS FALSE
           OR COALESCE(p.employment_status,'ACTIVE') IN ('INACTIVE','SUSPENDED','ARCHIVED','TERMINATED'))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_account_disabled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_disabled(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_any_staff_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT NOT public.is_account_disabled(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','super_admin','operations','support','accounts','finance','manager','executive')
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.is_account_disabled(_user_id)
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.is_account_disabled(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'::public.app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_finance_viewer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.is_account_disabled(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin'::public.app_role, 'finance'::public.app_role)
  )
$$;
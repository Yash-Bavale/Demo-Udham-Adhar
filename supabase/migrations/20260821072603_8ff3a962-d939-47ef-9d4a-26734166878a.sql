-- 1) Narrow workflow_automations realtime/table access to management roles only
DROP POLICY IF EXISTS "workflow_automations_staff_all" ON public.workflow_automations;

CREATE OR REPLACE FUNCTION public.is_workflow_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','super_admin','manager','operations')
  )
$$;

CREATE POLICY "workflow_automations_manager_all"
ON public.workflow_automations
FOR ALL
TO authenticated
USING (public.is_workflow_manager(auth.uid()))
WITH CHECK (public.is_workflow_manager(auth.uid()));

-- 2) Services: anonymous visitors only ever see active services
DROP POLICY IF EXISTS "Public can read active services" ON public.services;

CREATE POLICY "Anon can read active services"
ON public.services
FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY "Authenticated can read active services"
ON public.services
FOR SELECT
TO authenticated
USING (is_active = true OR public.current_user_is_admin() OR public.is_super_admin(auth.uid()));

-- 3) Least privilege by default for permission grants
ALTER TABLE public.user_permissions ALTER COLUMN scope_all SET DEFAULT false;

DROP POLICY IF EXISTS "Staff read applications" ON public.applications;
CREATE POLICY "Staff read applications" ON public.applications FOR SELECT
USING (
  current_user_is_admin()
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'operations'::app_role)
  OR has_role(auth.uid(), 'support'::app_role)
  OR has_role(auth.uid(), 'accounts'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'executive'::app_role)
);

DROP POLICY IF EXISTS "Staff read leads" ON public.leads;
CREATE POLICY "Staff read leads" ON public.leads FOR SELECT
USING (
  current_user_is_admin()
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'operations'::app_role)
  OR has_role(auth.uid(), 'support'::app_role)
  OR has_role(auth.uid(), 'accounts'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'executive'::app_role)
);

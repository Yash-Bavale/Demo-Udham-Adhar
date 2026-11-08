-- Tighten SELECT policies on applications and leads: restrict role from
-- public to authenticated (has_any_staff_role already enforced in USING).
DROP POLICY IF EXISTS "Staff read applications" ON public.applications;
CREATE POLICY "Staff read applications"
  ON public.applications
  FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "Staff read leads" ON public.leads;
CREATE POLICY "Staff read leads"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
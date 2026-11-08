
DROP POLICY IF EXISTS "Ops update customers" ON public.customers;
CREATE POLICY "Staff update customers" ON public.customers
  FOR UPDATE
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));

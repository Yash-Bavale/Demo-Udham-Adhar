DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Staff update customers" ON public.customers;
CREATE POLICY "Staff update customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (has_any_staff_role(auth.uid()))
  WITH CHECK (has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "no_hard_delete_customers" ON public.customers;
CREATE POLICY "no_hard_delete_customers" ON public.customers
  FOR DELETE TO authenticated
  USING (false);
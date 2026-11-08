
-- Explicit deny-all (no rows visible/writable to anon or authenticated).
-- Service role bypasses RLS, so server functions still work.
CREATE POLICY "No public access to leads" ON public.leads
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "No public access to payments" ON public.payments
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

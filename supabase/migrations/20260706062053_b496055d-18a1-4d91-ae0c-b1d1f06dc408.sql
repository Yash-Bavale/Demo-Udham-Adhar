
CREATE TABLE IF NOT EXISTS public.email_templates_stage (
  code TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body_b64 TEXT NOT NULL,
  category TEXT NOT NULL,
  flow_id TEXT,
  sr_no INT NOT NULL
);
GRANT ALL ON public.email_templates_stage TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates_stage TO authenticated;
ALTER TABLE public.email_templates_stage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage admins only"
  ON public.email_templates_stage FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

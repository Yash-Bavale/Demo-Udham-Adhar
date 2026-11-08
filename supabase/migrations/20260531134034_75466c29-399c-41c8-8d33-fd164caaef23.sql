-- Helper functions
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::public.app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_finance_viewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin'::public.app_role, 'finance'::public.app_role)
  )
$$;

-- Extend payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS application_id uuid,
  ADD COLUMN IF NOT EXISTS gateway_name text NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS gst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_date timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_response jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_uidx
  ON public.payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_lead_id_idx ON public.payments(lead_id);
CREATE INDEX IF NOT EXISTS payments_application_id_idx ON public.payments(application_id);

-- Replace permissive payments RLS with finance lockdown
DROP POLICY IF EXISTS "No public access to payments" ON public.payments;
DROP POLICY IF EXISTS "Finance read payments" ON public.payments;
DROP POLICY IF EXISTS "Finance write payments" ON public.payments;

CREATE POLICY "Finance read payments"
  ON public.payments FOR SELECT TO authenticated
  USING (public.is_finance_viewer(auth.uid()));

CREATE POLICY "Super admin write payments"
  ON public.payments FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Sanitized view for ops/support (no amounts)
DROP VIEW IF EXISTS public.payments_safe;
CREATE VIEW public.payments_safe
WITH (security_invoker = true) AS
  SELECT id, lead_id, application_id, gateway_name, status, payment_date, created_at
  FROM public.payments
  WHERE
    public.current_user_is_admin()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
    OR public.has_role(auth.uid(), 'support'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role);
GRANT SELECT ON public.payments_safe TO authenticated;

-- payment_gateways
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  webhook_secret_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance read gateways"
  ON public.payment_gateways FOR SELECT TO authenticated
  USING (public.is_finance_viewer(auth.uid()));
CREATE POLICY "Super admin manage gateways"
  ON public.payment_gateways FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS payment_gateways_touch ON public.payment_gateways;
CREATE TRIGGER payment_gateways_touch BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.payment_gateways (name, display_name, is_enabled, priority, webhook_secret_name) VALUES
  ('payu',     'PayU',     true,  10, 'PAYU_MERCHANT_SALT'),
  ('razorpay', 'Razorpay', false, 20, 'RAZORPAY_WEBHOOK_SECRET'),
  ('cashfree', 'Cashfree', false, 30, 'CASHFREE_WEBHOOK_SECRET'),
  ('phonepe',  'PhonePe',  false, 40, 'PHONEPE_WEBHOOK_SECRET')
ON CONFLICT (name) DO NOTHING;

-- Invoices
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE,
  lead_id uuid NOT NULL,
  application_id uuid,
  payment_id uuid NOT NULL,
  base_amount numeric NOT NULL,
  gst_amount numeric NOT NULL,
  total_amount numeric NOT NULL,
  pdf_path text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance read invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.is_finance_viewer(auth.uid()));
CREATE POLICY "Super admin write invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.invoice_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_set_number ON public.invoices;
CREATE TRIGGER invoices_set_number BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();

DROP TRIGGER IF EXISTS invoices_touch ON public.invoices;
CREATE TRIGGER invoices_touch BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS invoices_payment_id_idx ON public.invoices(payment_id);
CREATE INDEX IF NOT EXISTS invoices_lead_id_idx ON public.invoices(lead_id);

-- Audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  entity_type text NOT NULL,
  entity_id text,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "Staff write audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
    OR public.has_role(auth.uid(), 'support'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
    OR public.has_role(auth.uid(), 'accounts'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs(created_at DESC);
-- payment_links
CREATE TABLE public.payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  txnid text UNIQUE NOT NULL,
  payment_url text NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz,
  opened_at timestamptz,
  paid_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payment_links TO authenticated;
GRANT ALL ON public.payment_links TO service_role;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read payment_links" ON public.payment_links FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "staff insert payment_links" ON public.payment_links FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE POLICY "staff update payment_links" ON public.payment_links FOR UPDATE TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
CREATE INDEX payment_links_lead_idx ON public.payment_links(lead_id);
CREATE INDEX payment_links_status_idx ON public.payment_links(status);

-- webhook_error_log
CREATE TABLE public.webhook_error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type text NOT NULL,
  error_message text NOT NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_error_log TO authenticated;
GRANT ALL ON public.webhook_error_log TO service_role;
ALTER TABLE public.webhook_error_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read webhook_error_log" ON public.webhook_error_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- PayU detail columns on payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payu_mihpayid text,
  ADD COLUMN IF NOT EXISTS payu_mode text,
  ADD COLUMN IF NOT EXISTS payu_bank_ref_num text,
  ADD COLUMN IF NOT EXISTS payu_net_amount_debit numeric,
  ADD COLUMN IF NOT EXISTS payu_error_message text,
  ADD COLUMN IF NOT EXISTS webhook_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_test_payment boolean DEFAULT false;

-- Invoice GST snapshots
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS company_state_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_state_snapshot text;
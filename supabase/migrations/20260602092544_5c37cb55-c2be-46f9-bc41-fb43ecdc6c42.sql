
-- Extend invoices with GST split + PDF metadata
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sac_code text NOT NULL DEFAULT '998311';

-- Gateway settlements
CREATE TABLE IF NOT EXISTS public.gateway_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  settlement_id text NOT NULL,
  settled_at timestamptz NOT NULL,
  gross numeric NOT NULL DEFAULT 0,
  fees numeric NOT NULL DEFAULT 0,
  tax_on_fees numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, settlement_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateway_settlements TO authenticated;
GRANT ALL ON public.gateway_settlements TO service_role;

ALTER TABLE public.gateway_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance read settlements"
ON public.gateway_settlements FOR SELECT TO authenticated
USING (public.is_finance_viewer(auth.uid()));

CREATE POLICY "Super admin write settlements"
ON public.gateway_settlements FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Payment <-> settlement links
CREATE TABLE IF NOT EXISTS public.payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  settlement_id uuid NOT NULL REFERENCES public.gateway_settlements(id) ON DELETE CASCADE,
  settled_amount numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, settlement_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_settlements_payment ON public.payment_settlements(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_settlements_settlement ON public.payment_settlements(settlement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settlements TO authenticated;
GRANT ALL ON public.payment_settlements TO service_role;

ALTER TABLE public.payment_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance read payment settlements"
ON public.payment_settlements FOR SELECT TO authenticated
USING (public.is_finance_viewer(auth.uid()));

CREATE POLICY "Super admin write payment settlements"
ON public.payment_settlements FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

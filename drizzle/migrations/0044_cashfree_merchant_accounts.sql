CREATE TABLE public.cashfree_merchant_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_key text NOT NULL UNIQUE CHECK (account_key ~ '^[A-Z][A-Z0-9_]{1,30}$'),
  label text NOT NULL,
  is_legacy boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.cashfree_merchant_accounts IS 'Cashfree merchant accounts. No credentials stored: secrets live in server env as CASHFREE_<account_key>_CLIENT_ID/_CLIENT_SECRET/_MODE; the legacy account uses the original global CASHFREE_* secrets.';
CREATE UNIQUE INDEX cashfree_one_legacy_account ON public.cashfree_merchant_accounts ((true)) WHERE is_legacy;
GRANT SELECT ON public.cashfree_merchant_accounts TO authenticated;
GRANT ALL ON public.cashfree_merchant_accounts TO service_role;
ALTER TABLE public.cashfree_merchant_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read cashfree accounts" ON public.cashfree_merchant_accounts
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.cashfree_website_accounts (
  website_id uuid PRIMARY KEY REFERENCES public.websites(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.cashfree_merchant_accounts(id) ON DELETE RESTRICT,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cashfree_website_accounts TO authenticated;
GRANT ALL ON public.cashfree_website_accounts TO service_role;
ALTER TABLE public.cashfree_website_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read cashfree website mappings" ON public.cashfree_website_accounts
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_account_id uuid REFERENCES public.cashfree_merchant_accounts(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.payments.payment_account_id IS 'Cashfree merchant account used to create this payment. NULL on historical Cashfree rows = legacy global account.';
CREATE INDEX IF NOT EXISTS payments_payment_account_id_idx ON public.payments(payment_account_id) WHERE payment_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.lock_payment_account_id() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.payment_account_id IS NOT NULL AND NEW.payment_account_id IS DISTINCT FROM OLD.payment_account_id THEN
    RAISE EXCEPTION 'payment_account_id is immutable once set';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_lock_account BEFORE UPDATE OF payment_account_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.lock_payment_account_id();

INSERT INTO public.cashfree_merchant_accounts (account_key, label, is_legacy, is_active)
VALUES ('LEGACY', 'Existing Cashfree account (global)', true, true);
INSERT INTO public.cashfree_website_accounts (website_id, account_id, is_enabled)
SELECT w.id, a.id, true FROM public.websites w CROSS JOIN public.cashfree_merchant_accounts a WHERE a.is_legacy;
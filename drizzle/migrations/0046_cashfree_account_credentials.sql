CREATE TABLE public.cashfree_account_credentials (
  account_id uuid PRIMARY KEY REFERENCES public.cashfree_merchant_accounts(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  client_secret_ciphertext text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('production','sandbox')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.cashfree_account_credentials FROM anon, authenticated;
GRANT ALL ON public.cashfree_account_credentials TO service_role;
ALTER TABLE public.cashfree_account_credentials ENABLE ROW LEVEL SECURITY;
-- No policies: server-only (service role). Secrets are AES-256-GCM ciphertext bound to account_id.
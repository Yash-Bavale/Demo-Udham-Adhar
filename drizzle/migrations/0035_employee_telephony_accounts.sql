CREATE TABLE public.employee_telephony_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'callerdesk',
  member_id text,
  sip_username text,
  display_name text,
  sip_password_ciphertext text,
  key_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'unprovisioned' CHECK (status IN ('unprovisioned','active','disabled')),
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin','legacy_env_migration')),
  verified_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_requires_credentials CHECK (status <> 'active' OR (sip_username IS NOT NULL AND sip_password_ciphertext IS NOT NULL))
);
CREATE UNIQUE INDEX employee_telephony_accounts_sip_username_key ON public.employee_telephony_accounts (provider, sip_username) WHERE sip_username IS NOT NULL;
REVOKE ALL ON public.employee_telephony_accounts FROM anon, authenticated;
GRANT ALL ON public.employee_telephony_accounts TO service_role;
ALTER TABLE public.employee_telephony_accounts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.employee_telephony_accounts IS 'Per-employee CallerDesk SIP accounts. Server-only (service role); no client policies by design. Passwords are AES-256-GCM ciphertext bound to employee_id.';
CREATE TRIGGER employee_telephony_accounts_touch BEFORE UPDATE ON public.employee_telephony_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
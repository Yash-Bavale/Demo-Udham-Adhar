CREATE TABLE public.customer_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  kind text NOT NULL,
  lead_id uuid NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  max_uses integer,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  issued_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cat_lead ON public.customer_access_tokens (lead_id);
GRANT ALL ON public.customer_access_tokens TO service_role;
ALTER TABLE public.customer_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customer_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  reason text,
  scope text,
  lead_code text,
  lead_id uuid,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cae_ip_time ON public.customer_access_events (ip_hash, created_at DESC);
CREATE INDEX idx_cae_time ON public.customer_access_events (created_at DESC);
GRANT ALL ON public.customer_access_events TO service_role;
GRANT SELECT ON public.customer_access_events TO authenticated;
ALTER TABLE public.customer_access_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read access events" ON public.customer_access_events
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
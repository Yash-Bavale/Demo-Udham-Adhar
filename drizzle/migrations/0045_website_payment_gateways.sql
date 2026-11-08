CREATE TABLE public.website_payment_gateways (
  website_id uuid NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  gateway_name text NOT NULL CHECK (gateway_name IN ('cashfree','payu','ccavenue')),
  is_enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (website_id, gateway_name)
);
CREATE UNIQUE INDEX website_payment_gateways_one_default ON public.website_payment_gateways(website_id) WHERE is_default;
GRANT ALL ON public.website_payment_gateways TO service_role;
ALTER TABLE public.website_payment_gateways ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.website_payment_gateways IS 'Per-website payment option overrides. No row = follow the global gateway switch. Server-only access.';
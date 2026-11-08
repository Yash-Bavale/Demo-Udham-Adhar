
INSERT INTO public.payment_gateways (name, display_name, is_enabled, priority, webhook_secret_name)
VALUES ('ccavenue', 'CCAvenue', false, 20, 'CCAV_WORKING_KEY')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS parent_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_reason text;

CREATE INDEX IF NOT EXISTS payments_parent_payment_id_idx
  ON public.payments(parent_payment_id);


-- 1) Change invoice number prefix to BHS-YYYY-NNNNNN for new invoices.
CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'BHS-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.invoice_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Add lifecycle status columns to invoices.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS last_emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_email_status text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS replaced_at timestamptz,
  ADD COLUMN IF NOT EXISTS prev_pdf_paths text[] NOT NULL DEFAULT '{}'::text[];

-- 3) Invoice lifecycle event log.
CREATE TABLE IF NOT EXISTS public.invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN
    ('generated','regenerated','replaced','emailed','email_failed','delivery_update','preview')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text NOT NULL DEFAULT 'system',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.invoice_events TO authenticated;
GRANT ALL    ON public.invoice_events TO service_role;

ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with finance access can read invoice events"
  ON public.invoice_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'finance'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice_created
  ON public.invoice_events (invoice_id, created_at DESC);

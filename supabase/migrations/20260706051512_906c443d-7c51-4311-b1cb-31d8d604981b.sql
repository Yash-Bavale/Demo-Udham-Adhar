
-- 1. Allow standalone (no application) schedulers + direct ticket link
ALTER TABLE public.order_schedulers
  ALTER COLUMN application_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_order_schedulers_ticket ON public.order_schedulers(ticket_id) WHERE ticket_id IS NOT NULL;

-- 2. SLA defaults trigger
CREATE OR REPLACE FUNCTION public.set_ticket_sla_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  fr_hours INTEGER;
  res_hours INTEGER;
BEGIN
  IF NEW.first_response_due_at IS NULL OR NEW.resolution_due_at IS NULL THEN
    CASE COALESCE(NEW.priority::text, 'medium')
      WHEN 'urgent' THEN fr_hours := 1;  res_hours := 8;
      WHEN 'high'   THEN fr_hours := 2;  res_hours := 16;
      WHEN 'low'    THEN fr_hours := 8;  res_hours := 48;
      ELSE               fr_hours := 4;  res_hours := 24;
    END CASE;

    IF NEW.first_response_due_at IS NULL THEN
      NEW.first_response_due_at := COALESCE(NEW.created_at, now()) + (fr_hours || ' hours')::interval;
    END IF;
    IF NEW.resolution_due_at IS NULL THEN
      NEW.resolution_due_at := COALESCE(NEW.created_at, now()) + (res_hours || ' hours')::interval;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_ticket_sla_defaults ON public.support_tickets;
CREATE TRIGGER trg_set_ticket_sla_defaults
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_sla_defaults();

-- 3. Canned responses
CREATE TABLE public.canned_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canned_responses TO authenticated;
GRANT ALL ON public.canned_responses TO service_role;

ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view canned responses"
  ON public.canned_responses FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

CREATE POLICY "Staff can insert canned responses"
  ON public.canned_responses FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));

CREATE POLICY "Staff can update canned responses"
  ON public.canned_responses FOR UPDATE
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));

CREATE POLICY "Staff can delete canned responses"
  ON public.canned_responses FOR DELETE
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

CREATE TRIGGER trg_canned_responses_touch
  BEFORE UPDATE ON public.canned_responses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_canned_responses_active ON public.canned_responses(is_active, sort_order);

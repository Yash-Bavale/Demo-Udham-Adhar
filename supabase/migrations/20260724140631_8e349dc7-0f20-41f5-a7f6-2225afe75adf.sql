-- 1) Extend refund_requests
ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS refund_mode        text        NOT NULL DEFAULT 'full'  CHECK (refund_mode IN ('full','partial')),
  ADD COLUMN IF NOT EXISTS deduction_amount   numeric(12,2),
  ADD COLUMN IF NOT EXISTS deduction_reason   text,
  ADD COLUMN IF NOT EXISTS gateway_ref        text,
  ADD COLUMN IF NOT EXISTS gateway_name       text,
  ADD COLUMN IF NOT EXISTS processed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by       uuid,
  ADD COLUMN IF NOT EXISTS info_needed_note   text,
  ADD COLUMN IF NOT EXISTS escalation_note    text;

-- 2) Refund events (audit timeline)
CREATE TABLE IF NOT EXISTS public.refund_request_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  action      text NOT NULL,     -- raised|edited|approved|rejected|info_needed|escalated|processed|note
  note        text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refund_events_request_idx
  ON public.refund_request_events(request_id, created_at DESC);

GRANT SELECT, INSERT ON public.refund_request_events TO authenticated;
GRANT ALL ON public.refund_request_events TO service_role;

ALTER TABLE public.refund_request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refund_events_staff_read" ON public.refund_request_events;
CREATE POLICY "refund_events_staff_read"
  ON public.refund_request_events FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "refund_events_staff_insert" ON public.refund_request_events;
CREATE POLICY "refund_events_staff_insert"
  ON public.refund_request_events FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));

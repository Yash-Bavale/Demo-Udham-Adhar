ALTER TABLE public.telephony_calls
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS follow_up_id uuid;
CREATE INDEX IF NOT EXISTS telephony_calls_started_idx ON public.telephony_calls (started_at DESC);
CREATE INDEX IF NOT EXISTS telephony_calls_employee_started_idx ON public.telephony_calls (employee_id, started_at DESC);
CREATE INDEX IF NOT EXISTS telephony_calls_disposition_idx ON public.telephony_calls (disposition) WHERE disposition IS NOT NULL;
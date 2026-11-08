CREATE TABLE public.telephony_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'smartflo',
  call_id text NOT NULL UNIQUE,
  provider_uuid text,
  direction text NOT NULL DEFAULT 'inbound',
  caller_number text,
  called_number text,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_id text,
  customer_id uuid,
  lead_id uuid,
  application_id uuid,
  status text NOT NULL DEFAULT 'ringing',
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  disposition text,
  disposition_notes text,
  disposition_by uuid,
  disposition_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telephony_calls_employee_status_idx ON public.telephony_calls(employee_id, status);
CREATE INDEX telephony_calls_live_idx ON public.telephony_calls(status) WHERE status IN ('ringing','answered');
GRANT SELECT ON public.telephony_calls TO authenticated;
GRANT ALL ON public.telephony_calls TO service_role;
ALTER TABLE public.telephony_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees read own calls" ON public.telephony_calls FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.telephony_calls;
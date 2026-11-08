
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  session_id text,
  lead_id uuid,
  application_id uuid,
  page_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_idx ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON public.analytics_events (session_id);
CREATE INDEX IF NOT EXISTS analytics_events_lead_idx ON public.analytics_events (lead_id);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON public.analytics_events (created_at DESC);

GRANT SELECT, INSERT ON public.analytics_events TO anon;
GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert analytics events"
  ON public.analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Staff read analytics events"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (
    current_user_is_admin()
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'operations'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
    OR has_role(auth.uid(), 'accounts'::app_role)
  );


-- Workflow Engine Phase 1: state, timers, automations. Reuse existing workflow_events for timeline.

-- ---------- workflow_states ----------
CREATE TABLE IF NOT EXISTS public.workflow_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'payment_successful',
  status TEXT NOT NULL DEFAULT 'not_started',
  sub_status TEXT,
  paused BOOLEAN NOT NULL DEFAULT false,
  pause_reason TEXT,
  active_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  active_timer_id UUID,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_states TO authenticated;
GRANT ALL ON public.workflow_states TO service_role;
ALTER TABLE public.workflow_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_states_staff_all" ON public.workflow_states
  FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_workflow_states_stage ON public.workflow_states(stage);
CREATE INDEX IF NOT EXISTS idx_workflow_states_assigned ON public.workflow_states(assigned_to);
CREATE INDEX IF NOT EXISTS idx_workflow_states_paused ON public.workflow_states(paused) WHERE paused = true;

-- ---------- workflow_timers ----------
CREATE TABLE IF NOT EXISTS public.workflow_timers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  fires_at TIMESTAMPTZ NOT NULL,
  paused_at TIMESTAMPTZ,
  remaining_ms BIGINT,
  fired_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedup_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_timers TO authenticated;
GRANT ALL ON public.workflow_timers TO service_role;
ALTER TABLE public.workflow_timers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_timers_staff_all" ON public.workflow_timers
  FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_workflow_timers_due
  ON public.workflow_timers(fires_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_workflow_timers_app ON public.workflow_timers(application_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_timers_dedup
  ON public.workflow_timers(application_id, kind, dedup_key) WHERE dedup_key IS NOT NULL;

-- ---------- workflow_automations ----------
CREATE TABLE IF NOT EXISTS public.workflow_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_automations TO authenticated;
GRANT ALL ON public.workflow_automations TO service_role;
ALTER TABLE public.workflow_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_automations_staff_all" ON public.workflow_automations
  FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_automations_active
  ON public.workflow_automations(application_id, code) WHERE status IN ('running','paused');

-- triggers
CREATE TRIGGER trg_workflow_states_touch BEFORE UPDATE ON public.workflow_states
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_workflow_timers_touch BEFORE UPDATE ON public.workflow_timers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_workflow_automations_touch BEFORE UPDATE ON public.workflow_automations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_states;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_timers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_automations;

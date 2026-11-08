
-- ─────────────────────────────────────────────
-- SECTION A: Lead auto-assignment
-- ─────────────────────────────────────────────

-- Leads: add assigned_at + auto_assigned (assigned_to already exists)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN NOT NULL DEFAULT false;

-- Config
CREATE TABLE IF NOT EXISTS public.lead_assignment_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  assignment_mode TEXT NOT NULL DEFAULT 'round_robin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_assignment_config_global_uq
  ON public.lead_assignment_config ((service_id IS NULL)) WHERE service_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_assignment_config TO authenticated;
GRANT ALL ON public.lead_assignment_config TO service_role;
ALTER TABLE public.lead_assignment_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read assignment config" ON public.lead_assignment_config
  FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "admins manage assignment config" ON public.lead_assignment_config
  FOR ALL TO authenticated
  USING (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'::public.app_role));

-- Pool
CREATE TABLE IF NOT EXISTS public.assignment_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_assigned_at TIMESTAMPTZ,
  total_assigned INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_pool_user_service_uq
  ON public.assignment_pool (user_id, COALESCE(service_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_pool TO authenticated;
GRANT ALL ON public.assignment_pool TO service_role;
ALTER TABLE public.assignment_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read assignment pool" ON public.assignment_pool
  FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "admins manage assignment pool" ON public.assignment_pool
  FOR ALL TO authenticated
  USING (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'::public.app_role));

-- Seed global config row (disabled by default; admin enables in UI)
INSERT INTO public.lead_assignment_config (service_id, assignment_mode, is_active)
SELECT NULL, 'round_robin', false
WHERE NOT EXISTS (SELECT 1 FROM public.lead_assignment_config WHERE service_id IS NULL);

-- BEFORE INSERT: pick next assignee
CREATE OR REPLACE FUNCTION public.auto_assign_lead()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enabled BOOLEAN;
  v_next UUID;
  v_pool_id UUID;
BEGIN
  -- Skip if already assigned
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_active INTO v_enabled
    FROM public.lead_assignment_config
   WHERE service_id IS NULL
   LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  -- Service-specific pool first (NULLS FIRST), then global pool
  SELECT ap.id, ap.user_id INTO v_pool_id, v_next
    FROM public.assignment_pool ap
   WHERE ap.is_active = true
     AND (ap.service_id = NEW.service_id OR ap.service_id IS NULL)
   ORDER BY (ap.service_id IS NULL) ASC,  -- service-specific (false) first
            ap.last_assigned_at ASC NULLS FIRST,
            ap.total_assigned ASC
   LIMIT 1;

  IF v_next IS NOT NULL THEN
    NEW.assigned_to := v_next;
    NEW.assigned_at := now();
    NEW.auto_assigned := true;
    UPDATE public.assignment_pool
       SET last_assigned_at = now(), total_assigned = total_assigned + 1
     WHERE id = v_pool_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_assign_lead ON public.leads;
CREATE TRIGGER trg_auto_assign_lead
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_lead();

-- AFTER INSERT: log auto assignment
CREATE OR REPLACE FUNCTION public.log_lead_auto_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NEW.auto_assigned = true AND NEW.assigned_to IS NOT NULL THEN
    SELECT COALESCE(full_name, display_name, email, 'Staff') INTO v_name
      FROM public.profiles WHERE id = NEW.assigned_to;
    INSERT INTO public.application_events
      (lead_id, customer_id, event_type, new_value, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.customer_id, 'assignment_change', NEW.assigned_to::TEXT,
       NEW.assigned_to, COALESCE(v_name,'System'), 'system');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_auto_assignment ON public.leads;
CREATE TRIGGER trg_log_auto_assignment
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_auto_assignment();

-- AFTER UPDATE: log manual reassignment
CREATE OR REPLACE FUNCTION public.log_lead_manual_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor TEXT := 'System';
  v_role TEXT := 'system';
  v_new_name TEXT;
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    BEGIN
      SELECT COALESCE(p.display_name, p.email, 'Staff'), COALESCE(ur.role::TEXT,'staff')
        INTO v_actor, v_role
        FROM public.profiles p
        LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
       WHERE p.id = auth.uid() LIMIT 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    SELECT COALESCE(full_name, display_name, email, 'Unassigned') INTO v_new_name
      FROM public.profiles WHERE id = NEW.assigned_to;

    INSERT INTO public.application_events
      (lead_id, customer_id, event_type, old_value, new_value, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.customer_id, 'assignment_change',
       OLD.assigned_to::TEXT, NEW.assigned_to::TEXT,
       auth.uid(), v_actor, v_role);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_manual_reassignment ON public.leads;
CREATE TRIGGER trg_log_manual_reassignment
  AFTER UPDATE OF assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_manual_reassignment();

-- ─────────────────────────────────────────────
-- SECTION B: Email template enable/disable extras
-- ─────────────────────────────────────────────
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS disabled_reason TEXT;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS last_toggled_by UUID REFERENCES auth.users(id);
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS last_toggled_at TIMESTAMPTZ;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS total_sent INT NOT NULL DEFAULT 0;

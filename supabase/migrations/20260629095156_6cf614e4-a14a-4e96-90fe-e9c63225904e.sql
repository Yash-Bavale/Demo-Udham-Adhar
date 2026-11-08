
-- Add assignment tracking columns
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN NOT NULL DEFAULT FALSE;

-- Trigger function: auto-assign application on insert
CREATE OR REPLACE FUNCTION public.auto_assign_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_next UUID;
  v_pool_id UUID;
  v_lead_owner UUID;
  v_lead_owner_in_pool UUID;
BEGIN
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

  -- Inherit from parent lead if lead's assignee is in an active pool entry
  IF NEW.lead_id IS NOT NULL THEN
    SELECT assigned_to INTO v_lead_owner
      FROM public.leads
     WHERE id = NEW.lead_id;
    IF v_lead_owner IS NOT NULL THEN
      SELECT user_id INTO v_lead_owner_in_pool
        FROM public.assignment_pool
       WHERE user_id = v_lead_owner
         AND is_active = true
         AND (service_id = NEW.service_id OR service_id IS NULL)
       LIMIT 1;
      IF v_lead_owner_in_pool IS NOT NULL THEN
        NEW.assigned_to := v_lead_owner;
        NEW.assigned_at := now();
        NEW.auto_assigned := true;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Round-robin: service-specific first, then global
  SELECT ap.id, ap.user_id INTO v_pool_id, v_next
    FROM public.assignment_pool ap
   WHERE ap.is_active = true
     AND (ap.service_id = NEW.service_id OR ap.service_id IS NULL)
   ORDER BY (ap.service_id IS NULL) ASC,
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
END
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_application ON public.applications;
CREATE TRIGGER trg_auto_assign_application
  BEFORE INSERT ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_application();

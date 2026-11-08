
-- Phase 1: websites
ALTER TABLE public.websites ADD COLUMN IF NOT EXISTS description text;

-- Phase 2: services
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS expected_processing_days integer,
  ADD COLUMN IF NOT EXISTS journey_key text;

-- Phase 3: profiles / employee code
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_code text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS joining_date date;

CREATE SEQUENCE IF NOT EXISTS public.employee_code_seq START 1;

CREATE OR REPLACE FUNCTION public.set_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_code IS NULL THEN
    NEW.employee_code := 'EMP-' || lpad(nextval('public.employee_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_employee_code ON public.profiles;
CREATE TRIGGER trg_profiles_employee_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_code();

-- Backfill in creation order
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
    WHERE employee_code IS NULL
    ORDER BY created_at ASC NULLS LAST, id ASC
  LOOP
    n := n + 1;
    UPDATE public.profiles
       SET employee_code = 'EMP-' || lpad(n::text, 4, '0')
     WHERE id = r.id;
  END LOOP;
END $$;

-- Advance sequence past the highest assigned code
SELECT setval(
  'public.employee_code_seq',
  GREATEST(1, (
    SELECT COALESCE(MAX(NULLIF(regexp_replace(employee_code, '^EMP-', ''), '')::int), 0)
    FROM public.profiles
    WHERE employee_code ~ '^EMP-[0-9]+$'
  ))
);

-- Unique constraint (only add if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_employee_code_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_employee_code_key UNIQUE (employee_code);
  END IF;
END $$;

-- Phase 4: work permission modules
INSERT INTO public.permission_modules(key, label, sort_order) VALUES
  ('work.leads',   'Work: Leads',   900),
  ('work.orders',  'Work: Orders',  901),
  ('work.support', 'Work: Support', 902),
  ('work.finance', 'Work: Finance', 903)
ON CONFLICT (key) DO NOTHING;

-- Phase 4: scope-aware auto assignment
-- Rule: candidate must be in assignment_pool (existing round-robin source of truth).
-- Additionally, IF they have any work.<kind> permission row, they must also have
-- can_view=true on that module AND (no scopes rows OR a matching scope for
-- the record's website/service). Users with no work.* row at all fall back to
-- current behaviour (unrestricted), so existing setups keep working.

CREATE OR REPLACE FUNCTION public.auto_assign_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_next UUID;
  v_pool_id UUID;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;

  SELECT is_active INTO v_enabled
    FROM public.lead_assignment_config
   WHERE service_id IS NULL
   LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN RETURN NEW; END IF;

  SELECT ap.id, ap.user_id INTO v_pool_id, v_next
    FROM public.assignment_pool ap
   WHERE ap.is_active = true
     AND (ap.service_id = NEW.service_id OR ap.service_id IS NULL)
     -- work.leads permission gate (only enforced if user has a work.leads row)
     AND (
       NOT EXISTS (SELECT 1 FROM public.user_permissions up
                    WHERE up.user_id = ap.user_id AND up.module_key = 'work.leads')
       OR EXISTS (SELECT 1 FROM public.user_permissions up
                   WHERE up.user_id = ap.user_id AND up.module_key = 'work.leads'
                     AND up.can_view = true)
     )
     -- website scope (only enforced if user has any website scopes on work.leads)
     AND (
       NOT EXISTS (SELECT 1 FROM public.user_permission_scopes s
                    WHERE s.user_id = ap.user_id AND s.module_key = 'work.leads'
                      AND s.website_id IS NOT NULL)
       OR NEW.website_id IS NULL
       OR EXISTS (SELECT 1 FROM public.user_permission_scopes s
                   WHERE s.user_id = ap.user_id AND s.module_key = 'work.leads'
                     AND s.website_id = NEW.website_id)
     )
     -- service scope (only enforced if user has any service scopes on work.leads)
     AND (
       NOT EXISTS (SELECT 1 FROM public.user_permission_scopes s
                    WHERE s.user_id = ap.user_id AND s.module_key = 'work.leads'
                      AND s.service_id IS NOT NULL)
       OR NEW.service_id IS NULL
       OR EXISTS (SELECT 1 FROM public.user_permission_scopes s
                   WHERE s.user_id = ap.user_id AND s.module_key = 'work.leads'
                     AND s.service_id = NEW.service_id)
     )
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
END $$;

CREATE OR REPLACE FUNCTION public.auto_assign_application()
RETURNS trigger
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
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;

  SELECT is_active INTO v_enabled
    FROM public.lead_assignment_config
   WHERE service_id IS NULL
   LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN RETURN NEW; END IF;

  -- Inherit from parent lead if lead's assignee is in an active pool entry
  IF NEW.lead_id IS NOT NULL THEN
    SELECT assigned_to INTO v_lead_owner FROM public.leads WHERE id = NEW.lead_id;
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

  SELECT ap.id, ap.user_id INTO v_pool_id, v_next
    FROM public.assignment_pool ap
   WHERE ap.is_active = true
     AND (ap.service_id = NEW.service_id OR ap.service_id IS NULL)
     AND (
       NOT EXISTS (SELECT 1 FROM public.user_permissions up
                    WHERE up.user_id = ap.user_id AND up.module_key = 'work.orders')
       OR EXISTS (SELECT 1 FROM public.user_permissions up
                   WHERE up.user_id = ap.user_id AND up.module_key = 'work.orders'
                     AND up.can_view = true)
     )
     AND (
       NOT EXISTS (SELECT 1 FROM public.user_permission_scopes s
                    WHERE s.user_id = ap.user_id AND s.module_key = 'work.orders'
                      AND s.website_id IS NOT NULL)
       OR NEW.website_id IS NULL
       OR EXISTS (SELECT 1 FROM public.user_permission_scopes s
                   WHERE s.user_id = ap.user_id AND s.module_key = 'work.orders'
                     AND s.website_id = NEW.website_id)
     )
     AND (
       NOT EXISTS (SELECT 1 FROM public.user_permission_scopes s
                    WHERE s.user_id = ap.user_id AND s.module_key = 'work.orders'
                      AND s.service_id IS NOT NULL)
       OR NEW.service_id IS NULL
       OR EXISTS (SELECT 1 FROM public.user_permission_scopes s
                   WHERE s.user_id = ap.user_id AND s.module_key = 'work.orders'
                     AND s.service_id = NEW.service_id)
     )
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
END $$;

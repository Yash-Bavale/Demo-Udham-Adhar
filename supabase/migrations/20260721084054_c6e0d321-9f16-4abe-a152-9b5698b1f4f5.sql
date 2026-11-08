
-- 1) Backfill applications.customer_id from their linked lead
UPDATE public.applications a
   SET customer_id = l.customer_id
  FROM public.leads l
 WHERE a.lead_id = l.id
   AND a.customer_id IS NULL
   AND l.customer_id IS NOT NULL;

-- 2) Trigger on applications: on INSERT/UPDATE, inherit customer_id from lead when NULL
CREATE OR REPLACE FUNCTION public.inherit_application_customer_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT customer_id INTO NEW.customer_id FROM public.leads WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inherit_application_customer_id ON public.applications;
CREATE TRIGGER trg_inherit_application_customer_id
  BEFORE INSERT OR UPDATE OF lead_id, customer_id ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.inherit_application_customer_id();

-- 3) Trigger on leads: when customer_id gets set, cascade to that lead's applications missing customer_id
CREATE OR REPLACE FUNCTION public.cascade_lead_customer_id_to_applications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL
     AND (OLD.customer_id IS DISTINCT FROM NEW.customer_id) THEN
    UPDATE public.applications
       SET customer_id = NEW.customer_id
     WHERE lead_id = NEW.id
       AND customer_id IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cascade_lead_customer_id ON public.leads;
CREATE TRIGGER trg_cascade_lead_customer_id
  AFTER UPDATE OF customer_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.cascade_lead_customer_id_to_applications();

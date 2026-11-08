
CREATE OR REPLACE FUNCTION public.log_application_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_name TEXT := 'System';
  v_staff_role TEXT := 'system';
BEGIN
  BEGIN
    SELECT COALESCE(p.display_name, p.email, 'Staff'), COALESCE(ur.role::TEXT, 'staff')
      INTO v_staff_name, v_staff_role
      FROM public.profiles p
      LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
     WHERE p.id = auth.uid()
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  v_staff_name := COALESCE(v_staff_name, 'System');
  v_staff_role := COALESCE(v_staff_role, 'system');

  IF OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status THEN
    INSERT INTO public.application_events
      (application_id, lead_id, customer_id, event_type, old_value, new_value, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.lead_id, NEW.customer_id, 'status_change',
       OLD.fulfillment_status::TEXT, NEW.fulfillment_status::TEXT,
       auth.uid(), v_staff_name, v_staff_role);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.application_events
      (application_id, lead_id, customer_id, event_type, old_value, new_value, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.lead_id, NEW.customer_id, 'assignment_change',
       OLD.assigned_to::TEXT, NEW.assigned_to::TEXT,
       auth.uid(), v_staff_name, v_staff_role);
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.log_lead_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_name TEXT := 'System';
  v_staff_role TEXT := 'system';
BEGIN
  BEGIN
    SELECT COALESCE(p.display_name, p.email, 'Staff'), COALESCE(ur.role::TEXT, 'staff')
      INTO v_staff_name, v_staff_role
      FROM public.profiles p
      LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
     WHERE p.id = auth.uid()
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  v_staff_name := COALESCE(v_staff_name, 'System');
  v_staff_role := COALESCE(v_staff_role, 'system');

  IF OLD.lead_status_v2 IS DISTINCT FROM NEW.lead_status_v2 THEN
    INSERT INTO public.application_events
      (lead_id, customer_id, event_type, old_value, new_value, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.customer_id, 'lead_status_change',
       OLD.lead_status_v2::TEXT, NEW.lead_status_v2::TEXT,
       auth.uid(), v_staff_name, v_staff_role);
  END IF;
  RETURN NEW;
END $function$;
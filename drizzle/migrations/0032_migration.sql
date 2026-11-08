CREATE OR REPLACE FUNCTION public.set_application_form_submitted_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.status IS DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;

  UPDATE public.applications
     SET form_submitted_at = COALESCE(form_submitted_at, COALESCE(NEW.submitted_at, now()))
   WHERE lead_id = NEW.lead_id
     AND form_submitted_at IS NULL;

  BEGIN
    FOR r IN
      SELECT id, lead_id, customer_id, fulfillment_status::text AS fs
        FROM public.applications
       WHERE lead_id = NEW.lead_id
         AND COALESCE(is_deleted, false) = false
         AND (fulfillment_status::text IN ('customer_delay','customer_hold','form_not_submitted','awaiting_customer_form','awaiting_customer_form_legacy')
              OR customer_hold_started_at IS NOT NULL)
         AND COALESCE(fulfillment_status::text,'') NOT IN ('order_completed','order_closed','consultation_completed','application_rejected','certificate_rejected','cancelled','completed')
    LOOP
      UPDATE public.workflow_timers SET status = 'cancelled'
       WHERE application_id = r.id AND status IN ('running','paused');
      UPDATE public.workflow_reminders SET status = 'cancelled'
       WHERE application_id = r.id AND kind::text = 'pending_closure_followup' AND status::text IN ('pending','failed');
      UPDATE public.order_schedulers
         SET status = 'stopped', stopped_at = now(), stop_reason = 'customer_form_submitted',
             stop_triggered_by = 'system', updated_at = now()
       WHERE application_id = r.id AND status IN ('active','paused');

      UPDATE public.applications
         SET fulfillment_status = 'form_submitted',
             order_status = 'FORM_RECEIVED',
             customer_hold_started_at = NULL,
             active_reason_id = NULL,
             active_reason_text = NULL,
             workflow_status = 'processing',
             workflow_delay_reason = NULL,
             form_link_sent_at = NULL,
             updated_at = now()
       WHERE id = r.id;

      INSERT INTO public.application_events (application_id, lead_id, customer_id, event_type, old_value, new_value, note, staff_name, staff_role)
      VALUES (r.id, r.lead_id, r.customer_id, 'customer_form_resumed', r.fs, 'form_submitted',
              'Customer submitted the form — order resumed automatically and moved to Need Action', 'System', 'system');
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- Never block the customer's form submission because of the auto-resume step.
    RAISE WARNING 'auto-resume after form submit failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
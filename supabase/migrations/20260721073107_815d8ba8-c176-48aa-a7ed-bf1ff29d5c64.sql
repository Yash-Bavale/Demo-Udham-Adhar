-- Allow admins (and super admins) to bypass the order-status transition map.
-- The application-level "Admin Override" toggle already gates which buttons
-- are visible; the DB gate now trusts any authenticated admin to move an
-- order to any status without erroring "illegal transition X -> Y".
CREATE OR REPLACE FUNCTION public.transition_order_status(
  _order_id uuid,
  _new_status order_status_enum,
  _reason_id uuid DEFAULT NULL::uuid,
  _remarks text DEFAULT NULL::text,
  _force boolean DEFAULT false
)
RETURNS applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row       public.applications;
  v_old       public.order_status_enum;
  v_allowed   public.order_status_enum[];
  v_actor     uuid := auth.uid();
  v_is_admin  boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'transition_order_status: not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.applications WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transition_order_status: order % not found', _order_id;
  END IF;

  v_old := v_row.order_status;

  IF v_old = _new_status THEN
    RETURN v_row;
  END IF;

  -- Admins and super admins are trusted operators — the "Admin Override"
  -- toggle in the workspace UI is the human-facing gate. Skip the strict
  -- transition map for them so no button ever errors with
  -- "illegal transition X -> Y".
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_actor
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  ) INTO v_is_admin;

  IF NOT (_force OR v_is_admin) THEN
    v_allowed := public.allowed_order_transitions(v_old);
    IF NOT (_new_status = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'transition_order_status: illegal transition % -> %', v_old, _new_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.applications
     SET order_status = _new_status,
         closure_reason_id = CASE WHEN _new_status = 'CLOSED' THEN COALESCE(_reason_id, closure_reason_id) ELSE closure_reason_id END,
         closure_remarks   = CASE WHEN _new_status = 'CLOSED' THEN COALESCE(_remarks, closure_remarks) ELSE closure_remarks END,
         refund_requested_at = CASE WHEN _new_status = 'REFUND_REQUESTED' THEN COALESCE(refund_requested_at, now()) ELSE refund_requested_at END,
         refund_reason       = CASE WHEN _new_status = 'REFUND_REQUESTED' THEN COALESCE(_remarks, refund_reason) ELSE refund_reason END,
         reopened_at         = CASE WHEN _new_status = 'REOPENED' THEN now() ELSE reopened_at END,
         reopened_by         = CASE WHEN _new_status = 'REOPENED' THEN v_actor ELSE reopened_by END,
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO v_row;

  INSERT INTO public.application_events
    (application_id, lead_id, customer_id, event_type, old_value, new_value, note, created_by, staff_name, staff_role)
  VALUES
    (v_row.id, v_row.lead_id, v_row.customer_id, 'order_status_change',
     v_old::text, _new_status::text, _remarks, v_actor,
     COALESCE((SELECT display_name FROM public.profiles WHERE id = v_actor), 'Staff'),
     COALESCE((SELECT role::text FROM public.user_roles WHERE user_id = v_actor LIMIT 1), 'staff'));

  RETURN v_row;
END $function$;
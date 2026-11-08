CREATE OR REPLACE FUNCTION public.restart_order(_order_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_app public.applications;
  v_now timestamptz := now();
  v_cancelled integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_staff_role(v_actor) THEN
    RAISE EXCEPTION 'restart_order: forbidden';
  END IF;

  SELECT * INTO v_app
  FROM public.applications
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restart_order: order not found';
  END IF;

  UPDATE public.order_schedulers
  SET status = 'cancelled',
      stopped_at = v_now,
      stop_reason = 'order_restarted',
      stop_triggered_by = 'user',
      updated_at = v_now
  WHERE application_id = v_app.id
    AND scheduler_type IN ('customer_closure_24h', 'customer_side_delay')
    AND status IN ('active', 'paused');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.applications
  SET order_status = 'FORM_RECEIVED',
      fulfillment_status = 'form_submitted',
      workflow_status = NULL,
      closure_stage = 'none',
      application_status = 'form_submitted',
      closure_reason_id = NULL,
      closure_remarks = NULL,
      form_submitted_at = COALESCE(form_submitted_at, v_now),
      customer_hold_started_at = NULL,
      technical_hold_started_at = NULL,
      technical_hold_kind = NULL,
      active_reason_id = NULL,
      active_reason_text = NULL,
      reopened_at = v_now,
      reopened_by = v_actor,
      updated_at = v_now
  WHERE id = v_app.id;

  INSERT INTO public.application_events
    (application_id, lead_id, customer_id, event_type, old_value, new_value, note, created_by, staff_name, staff_role)
  VALUES
    (v_app.id, v_app.lead_id, v_app.customer_id,
     'order_status_change', v_app.order_status::text, 'FORM_RECEIVED',
     COALESCE(NULLIF(_note, ''), 'Order restarted — moved to Form Submitted'),
     v_actor,
     COALESCE((SELECT display_name FROM public.profiles WHERE id = v_actor), 'Staff'),
     COALESCE((SELECT role::text FROM public.user_roles WHERE user_id = v_actor LIMIT 1), 'staff'));

  RETURN jsonb_build_object(
    'ok', true,
    'applicationId', v_app.id,
    'cancelledCustomerDelayTimers', v_cancelled,
    'fulfillmentStatus', 'form_submitted',
    'orderStatus', 'FORM_RECEIVED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restart_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restart_order(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.restart_order_from_ticket(_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_ticket public.support_tickets;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_staff_role(v_actor) THEN
    RAISE EXCEPTION 'restart_order_from_ticket: forbidden';
  END IF;

  SELECT * INTO v_ticket
  FROM public.support_tickets
  WHERE id = _ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restart_order_from_ticket: ticket not found';
  END IF;
  IF v_ticket.application_id IS NULL THEN
    RAISE EXCEPTION 'restart_order_from_ticket: ticket is not linked to an order';
  END IF;

  v_result := public.restart_order(
    v_ticket.application_id,
    'Restarted from ticket ' || COALESCE(v_ticket.ticket_number, left(v_ticket.id::text, 8)) || ' — moved to Form Submitted'
  );

  UPDATE public.support_tickets
  SET status = 'closed',
      resolved_at = v_now,
      resolved_by = v_actor,
      closed_at = v_now,
      updated_at = v_now,
      last_staff_message_at = v_now
  WHERE id = v_ticket.id;

  INSERT INTO public.ticket_replies
    (ticket_id, reply_text, is_internal, created_by, direction)
  VALUES
    (v_ticket.id, 'Closed: Restarted order to Form Submitted.', true, v_actor, 'note');

  RETURN v_result || jsonb_build_object('ticketId', v_ticket.id);
END;
$$;

REVOKE ALL ON FUNCTION public.restart_order_from_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restart_order_from_ticket(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.restart_order_from_ticket(_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_ticket public.support_tickets;
  v_app public.applications;
  v_now timestamptz := now();
  v_cancelled integer := 0;
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

  SELECT * INTO v_app
  FROM public.applications
  WHERE id = v_ticket.application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restart_order_from_ticket: linked order not found';
  END IF;

  UPDATE public.order_schedulers
  SET status = 'cancelled',
      stopped_at = v_now,
      stop_reason = 'order_restarted_from_ticket',
      stop_triggered_by = 'user',
      updated_at = v_now
  WHERE application_id = v_app.id
    AND scheduler_type IN ('customer_closure_24h', 'customer_side_delay')
    AND status IN ('active', 'paused');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.applications
  SET order_status = 'FORM_RECEIVED',
      fulfillment_status = 'form_submitted',
      form_submitted_at = COALESCE(form_submitted_at, v_now),
      customer_hold_started_at = NULL,
      active_reason_id = NULL,
      active_reason_text = NULL,
      updated_at = v_now
  WHERE id = v_app.id;

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

  INSERT INTO public.application_events
    (application_id, lead_id, customer_id, event_type, old_value, new_value, note, created_by, staff_name, staff_role)
  VALUES
    (v_app.id, v_app.lead_id, COALESCE(v_ticket.customer_id, v_app.customer_id),
     'order_status_change', v_app.order_status::text, 'FORM_RECEIVED',
     'Restarted from ticket ' || COALESCE(v_ticket.ticket_number, left(v_ticket.id::text, 8)) || ' — moved to Form Submitted',
     v_actor,
     COALESCE((SELECT display_name FROM public.profiles WHERE id = v_actor), 'Staff'),
     COALESCE((SELECT role::text FROM public.user_roles WHERE user_id = v_actor LIMIT 1), 'staff'));

  RETURN jsonb_build_object(
    'ok', true,
    'applicationId', v_app.id,
    'ticketId', v_ticket.id,
    'cancelledCustomerDelayTimers', v_cancelled,
    'fulfillmentStatus', 'form_submitted',
    'orderStatus', 'FORM_RECEIVED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restart_order_from_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restart_order_from_ticket(uuid) TO authenticated, service_role;
DO $$
DECLARE
  v_reason_id uuid;
  v_row record;
BEGIN
  SELECT id INTO v_reason_id FROM public.order_close_reasons WHERE is_active = true ORDER BY number LIMIT 1;

  FOR v_row IN
    SELECT id, order_status, lead_id, customer_id, application_code
    FROM public.applications
    WHERE fulfillment_status = 'customer_delay'
      AND customer_hold_started_at < now() - interval '8 hours'
      AND order_status <> 'CLOSED'
  LOOP
    UPDATE public.applications
       SET order_status = 'CLOSED',
           fulfillment_status = 'order_closed',
           application_status = 'cancelled',
           closure_reason_id = COALESCE(closure_reason_id, v_reason_id),
           closure_remarks = COALESCE(closure_remarks, 'Auto-close (backfill): customer delay unresolved within 8 hours'),
           customer_hold_started_at = NULL,
           active_reason_id = NULL,
           active_reason_text = NULL,
           updated_at = now()
     WHERE id = v_row.id;

    UPDATE public.order_schedulers
       SET status = 'stopped',
           stopped_at = now(),
           stop_reason = 'auto_close_backfill',
           stop_triggered_by = 'system',
           updated_at = now()
     WHERE application_id = v_row.id
       AND status IN ('active','paused');

    INSERT INTO public.application_events
      (application_id, lead_id, customer_id, event_type, old_value, new_value, note, staff_name, staff_role)
    VALUES
      (v_row.id, v_row.lead_id, v_row.customer_id, 'order_status_change',
       v_row.order_status, 'CLOSED',
       'Backfill: auto-closed after customer-delay window elapsed', 'System', 'system');

    INSERT INTO public.workflow_events
      (application_id, lead_id, event_type, title, description, customer_visible, actor_name, is_system, metadata)
    VALUES
      (v_row.id, v_row.lead_id, 'order_auto_closed',
       'Order auto-closed (backfill)',
       'Customer-delay window had elapsed; state reconciled by backfill.',
       false, 'System', true,
       jsonb_build_object('reason', 'backfill_customer_delay_expired'));
  END LOOP;
END $$;
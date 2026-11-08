
-- ─────────────────────────────────────────────────────────────
-- Phase 2 — helper RPCs
-- ─────────────────────────────────────────────────────────────

-- 1. list_order_close_reasons: reason picker data source
CREATE OR REPLACE FUNCTION public.list_order_close_reasons()
RETURNS TABLE (
  id UUID,
  category TEXT,
  number INT,
  label TEXT,
  standard_reply TEXT,
  sort_order INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, category, number, label, standard_reply, sort_order
  FROM public.order_close_reasons
  WHERE is_active = TRUE
  ORDER BY category, sort_order, number;
$$;

GRANT EXECUTE ON FUNCTION public.list_order_close_reasons() TO authenticated;

-- 2. ticket_reopen_or_create: single ticket per order lifetime
--    Matches on (lower(customer_email), order/application id):
--      a) return open ticket if one exists
--      b) else reopen the most recent closed ticket (bumps reopened_count)
--      c) else create a new ticket
CREATE OR REPLACE FUNCTION public.ticket_reopen_or_create(
  _application_id UUID,
  _customer_email TEXT,
  _subject TEXT,
  _channel TEXT DEFAULT 'email'
)
RETURNS TABLE (
  ticket_id UUID,
  was_reopened BOOLEAN,
  was_created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_id UUID;
  v_closed_id UUID;
  v_new_id UUID;
  v_email TEXT := lower(coalesce(_customer_email, ''));
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'ticket_reopen_or_create: customer_email required';
  END IF;

  -- a) existing open ticket for this order + email
  SELECT id INTO v_open_id
  FROM public.support_tickets
  WHERE application_id = _application_id
    AND lower(customer_email) = v_email
    AND status NOT IN ('closed', 'resolved')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_open_id IS NOT NULL THEN
    RETURN QUERY SELECT v_open_id, FALSE, FALSE;
    RETURN;
  END IF;

  -- b) reopen last closed ticket (one-ticket-per-order rule)
  SELECT id INTO v_closed_id
  FROM public.support_tickets
  WHERE application_id = _application_id
    AND lower(customer_email) = v_email
    AND status IN ('closed', 'resolved')
  ORDER BY coalesce(last_closed_at, updated_at, created_at) DESC
  LIMIT 1;

  IF v_closed_id IS NOT NULL THEN
    UPDATE public.support_tickets
    SET status = 'open',
        reopened_count = coalesce(reopened_count, 0) + 1,
        updated_at = now()
    WHERE id = v_closed_id;
    RETURN QUERY SELECT v_closed_id, TRUE, FALSE;
    RETURN;
  END IF;

  -- c) create fresh ticket
  INSERT INTO public.support_tickets (application_id, customer_email, subject, channel, status)
  VALUES (_application_id, v_email, coalesce(_subject, 'Customer inquiry'), coalesce(_channel, 'email'), 'open')
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, FALSE, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ticket_reopen_or_create(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Migration: 20260925131500_repair_completed_closed_event_dates.sql
-- Description: Orders Module - Completed, Closed & Action Taken Logic
-- 1. Completed & Closed counts and tab queues evaluate when the order was fulfilled/completed (application_events completion event, fulfilled_at, certificate_uploaded_at, updated_at) or closed (application_events closure event, updated_at) against the selected date range in IST, regardless of original created_at date.
-- 2. Action Taken (Pending) represents orders in Technical Delay, Customer Delay, Scheduled Callback (Reminders), and Completed.
-- 3. Live operational queues (Needs Action, Hot Orders, Backlog, Callbacks, Delays) remain live all-time portfolio views.

CREATE OR REPLACE FUNCTION public.get_orders_v3_paged(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_bucket text DEFAULT 'all',
  p_stage text DEFAULT NULL,
  p_fulfillment_status text DEFAULT NULL,
  p_action_status text DEFAULT 'all',
  p_service_id uuid DEFAULT NULL,
  p_assigned_to text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_pending_age text DEFAULT NULL,
  p_custom_days integer DEFAULT NULL,
  p_sort_field text DEFAULT 'created_at',
  p_sort_order text DEFAULT 'desc',
  p_user_id uuid DEFAULT NULL,
  p_is_admin boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page int := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size int := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_offset int;
  v_search text := NULLIF(TRIM(p_search), '');
  v_now timestamptz := NOW();
  v_today_ist_start timestamptz := ((NOW() AT TIME ZONE 'Asia/Kolkata')::date::text || ' 00:00:00+05:30')::timestamptz;
  v_result jsonb;
BEGIN
  v_offset := (v_page - 1) * v_page_size;

  WITH base_candidates AS (
    SELECT
      a.id AS id,
      a.application_code,
      COALESCE(a.fulfillment_status, 'order_received') AS fulfillment_status,
      a.application_status,
      a.workflow_status,
      a.closure_stage,
      a.closure_reason_code,
      a.form_submitted_at,
      a.form_link_sent_at,
      a.certificate_uploaded_at,
      a.fulfilled_at,
      a.updated_at,
      a.refund_approved_at,
      a.refund_processed_at,
      a.order_status,
      a.created_at,
      a.assigned_to,
      a.lead_id,
      a.customer_id,
      COALESCE(a.service_id, l.service_id) AS service_id,
      l.lead_code,
      l.lead_status_v2,
      l.status AS lead_status,
      l.service AS lead_service,
      l.lead_source,
      COALESCE(l.name, c.name, '—') AS customer_name,
      COALESCE(l.mobile, c.primary_mobile) AS customer_mobile,
      COALESCE(l.email, c.primary_email) AS customer_email,
      COALESCE(s.service_name, l.service) AS service_name,
      COALESCE(p.display_name, p.full_name, p.email) AS assigned_name,
      COALESCE(pmt.paid_sum, 0) AS paid_sum,
      CASE
        WHEN COALESCE(pmt.paid_sum, 0) > 0 THEN pmt.paid_sum
        ELSE COALESCE(l.total_amount, 0)
      END AS total_amount,
      pmt.payment_count,
      pmt.refund_count,
      pmt.positive_count,
      pmt.refunded_positive_count,
      pmt.failed_positive_count,
      rr.status AS refund_req_status,
      rr.decided_at AS refund_req_decided_at,
      rr.created_at AS refund_req_created_at,
      os.id AS scheduler_id,
      os.fires_at AS scheduler_fires_at,
      os.remarks AS scheduler_remarks,
      os.created_at AS scheduler_created_at,
      os.scheduler_type,
      ev_comp.event_completed_at,
      ev_close.event_closed_at
    FROM applications a
    LEFT JOIN leads l ON a.lead_id = l.id
    LEFT JOIN customers c ON a.customer_id = c.id
    LEFT JOIN services s ON s.id = COALESCE(a.service_id, l.service_id)
    LEFT JOIN profiles p ON a.assigned_to = p.id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) AS paid_sum,
        COUNT(pay.id) AS payment_count,
        COUNT(CASE WHEN pay.amount < 0 OR pay.status = 'refunded' THEN 1 END) AS refund_count,
        COUNT(CASE WHEN pay.amount >= 0 THEN 1 END) AS positive_count,
        COUNT(CASE WHEN pay.amount >= 0 AND pay.status = 'refunded' THEN 1 END) AS refunded_positive_count,
        COUNT(CASE WHEN pay.amount >= 0 AND pay.status = 'failed' THEN 1 END) AS failed_positive_count,
        MIN(CASE WHEN pay.status = 'paid' THEN pay.payment_date END) AS earliest_paid_at
      FROM payments pay
      WHERE pay.application_id = a.id OR (a.lead_id IS NOT NULL AND pay.lead_id = a.lead_id)
    ) pmt ON TRUE
    LEFT JOIN LATERAL (
      SELECT r.status, r.decided_at, r.created_at
      FROM refund_requests r
      WHERE r.application_id = a.id
      ORDER BY r.created_at DESC
      LIMIT 1
    ) rr ON TRUE
    LEFT JOIN LATERAL (
      SELECT sch.id, sch.fires_at, sch.remarks, sch.created_at, sch.scheduler_type
      FROM order_schedulers sch
      WHERE sch.application_id = a.id AND sch.status = 'active'
      ORDER BY sch.created_at DESC
      LIMIT 1
    ) os ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(ev.created_at) AS event_completed_at
      FROM application_events ev
      WHERE ev.application_id = a.id
        AND (
          ev.new_value ILIKE '%complete%'
          OR ev.event_type ILIKE '%complete%'
          OR ev.event_type = 'certificate_uploaded'
          OR ev.event_type = 'order_completed'
        )
    ) ev_comp ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(ev.created_at) AS event_closed_at
      FROM application_events ev
      WHERE ev.application_id = a.id
        AND (
          ev.new_value ILIKE '%close%'
          OR ev.new_value ILIKE '%cancel%'
          OR ev.event_type ILIKE '%close%'
          OR ev.event_type ILIKE '%cancel%'
          OR ev.event_type = 'order_closed'
        )
    ) ev_close ON TRUE
    WHERE a.is_deleted = false
      -- User authorization / assignee scope
      AND (
        p_is_admin = true
        OR a.assigned_to = p_user_id
      )
      -- Assignee filter
      AND (
        p_assigned_to IS NULL
        OR p_assigned_to = 'all'
        OR (p_assigned_to = 'unassigned' AND a.assigned_to IS NULL)
        OR (p_assigned_to <> 'unassigned' AND a.assigned_to::text = p_assigned_to)
      )
      -- Service filter
      AND (
        p_service_id IS NULL
        OR COALESCE(a.service_id, l.service_id) = p_service_id
      )
      -- Candidate Selection:
      -- 1. Created in date range
      -- 2. Completed in date range (via event or fulfillment timestamp)
      -- 3. Closed in date range (via event or update timestamp)
      -- 4. Currently active non-terminal order (live operational portfolio)
      AND (
        (
          (p_date_from IS NULL OR a.created_at >= p_date_from)
          AND (p_date_to IS NULL OR a.created_at <= p_date_to)
        )
        OR (
          (p_date_from IS NULL OR COALESCE(ev_comp.event_completed_at, a.fulfilled_at, a.certificate_uploaded_at, a.updated_at, a.created_at) >= p_date_from)
          AND (p_date_to IS NULL OR COALESCE(ev_comp.event_completed_at, a.fulfilled_at, a.certificate_uploaded_at, a.updated_at, a.created_at) <= p_date_to)
        )
        OR (
          (p_date_from IS NULL OR COALESCE(ev_close.event_closed_at, a.updated_at, a.created_at) >= p_date_from)
          AND (p_date_to IS NULL OR COALESCE(ev_close.event_closed_at, a.updated_at, a.created_at) <= p_date_to)
        )
        OR (
          COALESCE(a.fulfillment_status::text, '') NOT IN ('completed', 'order_completed', 'order_closed', 'cancelled', 'application_rejected', 'certificate_rejected', 'consultation_completed')
          AND COALESCE(a.application_status::text, '') NOT IN ('completed', 'closed', 'cancelled')
          AND COALESCE(a.order_status::text, '') NOT IN ('completed', 'closed', 'cancelled')
          AND COALESCE(a.workflow_status::text, '') NOT IN ('completed', 'closed', 'cancelled')
          AND (a.closure_stage IS NULL OR a.closure_stage::text = 'none')
        )
      )
      -- Search across code, lead, name, mobile, email
      AND (
        v_search IS NULL
        OR a.application_code ILIKE ('%' || v_search || '%')
        OR l.lead_code ILIKE ('%' || v_search || '%')
        OR l.name ILIKE ('%' || v_search || '%')
        OR l.mobile ILIKE ('%' || v_search || '%')
        OR l.email ILIKE ('%' || v_search || '%')
        OR c.name ILIKE ('%' || v_search || '%')
        OR c.primary_mobile ILIKE ('%' || v_search || '%')
        OR c.primary_email ILIKE ('%' || v_search || '%')
      )
  ),
  computed_orders AS (
    SELECT
      bc.*,
      -- 1. Stage Computation
      CASE
        WHEN bc.closure_stage IS NOT NULL AND bc.closure_stage::text <> 'none' THEN bc.closure_stage::text

        WHEN bc.refund_processed_at IS NOT NULL
          OR bc.refund_req_status = 'processed'
          OR bc.fulfillment_status::text = 'refunded'
        THEN 'refunded'

        WHEN bc.refund_approved_at IS NOT NULL
          OR bc.refund_req_status = 'approved'
          OR bc.fulfillment_status::text = 'refund_approved'
        THEN 'refund_approved'

        WHEN bc.refund_req_status = 'pending'
          OR bc.fulfillment_status::text = 'refund_requested'
        THEN 'refund_requested'

        WHEN bc.fulfillment_status::text = 'uninterested'
        THEN 'uninterested'

        WHEN bc.fulfillment_status::text IN ('order_closed', 'cancelled', 'application_rejected', 'certificate_rejected')
        THEN 'closed'

        WHEN bc.fulfillment_status::text IN ('order_completed', 'completed', 'application_approved')
        THEN 'completed'

        WHEN bc.fulfillment_status::text IN ('certificate_uploaded', 'certificate_ready')
        THEN 'certificate_ready'

        WHEN bc.fulfillment_status::text = 'submitted_to_govt'
        THEN 'submitted_to_govt'

        WHEN bc.certificate_uploaded_at IS NOT NULL
        THEN 'certificate_ready'

        WHEN bc.fulfillment_status::text IN ('government_processing', 'application_submitted', 'under_processing', 'awaiting_govt')
        THEN 'submitted_to_govt'

        WHEN bc.fulfillment_status::text = 'verification_pending'
        THEN 'under_review'

        WHEN bc.fulfillment_status::text = 'documents_received'
        THEN 'in_progress'

        WHEN bc.fulfillment_status::text = 'customer_delay'
          OR bc.workflow_status::text IN ('waiting_for_customer', 'waiting_for_documents', 'customer_non_responsive', 'customer_delay')
        THEN 'customer_delay'

        WHEN bc.fulfillment_status::text IN ('technical_delay', 'technical_hold')
          OR bc.workflow_status::text IN ('government_portal_pending', 'technical_hold', 'external_dependency')
        THEN 'technical_delay'

        WHEN bc.fulfillment_status::text = 'order_reopened'
          OR bc.application_status::text = 'order_reopened'
          OR bc.order_status::text = 'REOPENED'
        THEN 'order_reopened'

        WHEN bc.fulfillment_status::text = 'consultation_completed'
        THEN 'consultation_completed'

        WHEN bc.application_status::text IN ('consultation_pending', 'consultation_scheduled')
          OR (
            (lower(regexp_replace(COALESCE(bc.lead_source, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE '%talktoexpert%'
             OR lower(regexp_replace(COALESCE(bc.lead_source, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE '%expertconsultation%'
             OR lower(regexp_replace(COALESCE(bc.lead_service, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE '%expertconsultation%'
             OR lower(regexp_replace(COALESCE(bc.lead_service, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE '%talktoexpert%'
             OR lower(regexp_replace(COALESCE(bc.lead_service, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE '%suitableserviceselection%')
            AND (lower(regexp_replace(COALESCE(bc.lead_service, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE '%expertconsultation%'
                 OR lower(regexp_replace(COALESCE(bc.lead_service, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE '%talktoexpert%'
                 OR lower(regexp_replace(COALESCE(bc.lead_service, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE '%suitableserviceselection%')
          )
        THEN 'consultation_pending'

        WHEN bc.fulfillment_status::text = 'form_submitted'
        THEN 'form_submitted'

        WHEN bc.fulfillment_status::text IN ('waiting_for_customer_submission', 'awaiting_customer_form', 'form_not_submitted', 'form_pending', 'waiting_customer', 'customer_form_pending')
        THEN 'form_not_submitted'

        WHEN bc.form_submitted_at IS NULL
        THEN 'payment_done'

        ELSE 'form_submitted'
      END AS stage,

      -- 2. Payment Status Rollup
      CASE
        WHEN bc.payment_count = 0 THEN 'Pending'
        WHEN bc.refund_count > 0 AND bc.positive_count > 0 AND bc.positive_count = bc.refunded_positive_count THEN 'Refunded'
        WHEN bc.paid_sum <= 0 THEN
          CASE WHEN bc.failed_positive_count > 0 THEN 'Failed' ELSE 'Pending' END
        WHEN bc.total_amount > 0 AND bc.paid_sum < (bc.total_amount - 0.01) THEN 'Partially Paid'
        ELSE 'Paid'
      END AS payment_status,

      -- 3. Is Terminal helper
      (
        bc.fulfillment_status::text IN ('completed', 'order_completed', 'order_closed', 'cancelled', 'application_rejected', 'certificate_rejected', 'consultation_completed')
        OR lower(COALESCE(bc.application_status::text, '')) IN ('completed', 'closed', 'cancelled')
        OR lower(COALESCE(bc.order_status::text, '')) IN ('completed', 'closed', 'cancelled')
        OR lower(COALESCE(bc.workflow_status::text, '')) IN ('completed', 'closed', 'cancelled')
        OR (bc.closure_stage IS NOT NULL AND bc.closure_stage::text <> 'none')
      ) AS is_terminal,

      -- 4. Is Reopened helper
      (
        bc.fulfillment_status::text = 'order_reopened'
        OR bc.application_status::text = 'order_reopened'
        OR bc.order_status::text = 'REOPENED'
      ) AS is_reopened_raw,

      -- 5. Is Due helper
      (bc.scheduler_fires_at IS NOT NULL AND bc.scheduler_fires_at <= v_now) AS is_due_raw,
      (bc.scheduler_fires_at IS NOT NULL AND bc.scheduler_fires_at > v_now) AS is_active_cb_raw,
      -- Older than today (created before today's IST midnight)
      (bc.created_at < v_today_ist_start) AS is_older_than_today,

      -- Range flags
      (
        (p_date_from IS NULL OR bc.created_at >= p_date_from)
        AND (p_date_to IS NULL OR bc.created_at <= p_date_to)
      ) AS in_range_created,

      (
        (p_date_from IS NULL OR COALESCE(bc.event_completed_at, bc.fulfilled_at, bc.certificate_uploaded_at, bc.updated_at, bc.created_at) >= p_date_from)
        AND (p_date_to IS NULL OR COALESCE(bc.event_completed_at, bc.fulfilled_at, bc.certificate_uploaded_at, bc.updated_at, bc.created_at) <= p_date_to)
      ) AS in_range_completed,

      (
        (p_date_from IS NULL OR COALESCE(bc.event_closed_at, bc.updated_at, bc.created_at) >= p_date_from)
        AND (p_date_to IS NULL OR COALESCE(bc.event_closed_at, bc.updated_at, bc.created_at) <= p_date_to)
      ) AS in_range_closed
    FROM base_candidates bc
  ),
  classified_orders AS (
    SELECT
      co.*,
      -- Hot order logic: strictly isolated, due now or reopened
      (NOT co.is_terminal AND (co.is_due_raw OR co.is_reopened_raw OR co.stage = 'order_reopened')) AS is_hot,
      -- Active future callback logic: fires_at > now
      (NOT co.is_terminal AND NOT (co.is_due_raw OR co.is_reopened_raw OR co.stage = 'order_reopened') AND co.is_active_cb_raw) AS is_callback_scheduled,
      -- 10 Canonical Buckets
      CASE
        WHEN co.stage IN ('refund_requested', 'refunded', 'uninterested') THEN 'exception'
        WHEN co.fulfillment_status::text IN ('application_rejected', 'certificate_rejected', 'order_closed', 'cancelled') OR co.stage = 'closed' THEN 'closed'
        WHEN co.fulfillment_status::text IN ('consultation_completed', 'order_completed', 'completed') OR co.stage = 'completed' THEN 'completed'
        -- Hot orders strictly under Hot Orders ONLY
        WHEN (NOT co.is_terminal AND (co.is_due_raw OR co.is_reopened_raw OR co.stage = 'order_reopened')) THEN 'hot_orders'
        -- Active Callbacks strictly under Call Back Scheduled
        WHEN (NOT co.is_terminal AND co.is_active_cb_raw) THEN 'reminders'
        -- Technical Delay
        WHEN co.stage = 'technical_delay' OR co.fulfillment_status::text = 'technical_delay' THEN 'technical_delay'
        -- Customer Delay
        WHEN co.stage = 'customer_delay' OR co.fulfillment_status::text = 'customer_delay' THEN 'customer_delay'
        -- Untouched Action Stages: Needs Action (today) vs Backlog (previous days)
        WHEN co.stage IN ('lead_received', 'payment_done', 'form_submitted', 'form_not_submitted') THEN
          CASE WHEN co.is_older_than_today THEN 'backlog' ELSE 'needs_action' END
        ELSE 'pending' -- Action Taken
      END AS bucket,
      -- Action Status Label
      CASE
        WHEN (NOT co.is_terminal AND (co.is_due_raw OR co.is_reopened_raw OR co.stage = 'order_reopened'))
          THEN 'Call Due Now'
        WHEN (NOT co.is_terminal AND co.is_active_cb_raw)
          THEN 'Scheduled Callback'
        WHEN co.fulfillment_status::text IN ('order_closed', 'cancelled') OR co.stage = 'closed'
          THEN 'Order Closed'
        WHEN co.fulfillment_status::text IN ('application_approved', 'consultation_completed', 'order_completed', 'completed') OR co.stage = 'completed'
          THEN 'Completed'
        WHEN co.stage = 'technical_delay' OR co.fulfillment_status::text = 'technical_delay'
          THEN 'Technical Delay'
        WHEN co.stage = 'customer_delay' OR co.fulfillment_status::text = 'customer_delay'
          THEN 'Customer Delay'
        WHEN co.fulfillment_status::text IN (
          'government_processing', 'under_processing', 'application_submitted', 'verification_pending',
          'documents_received', 'waiting_for_customer_submission', 'awaiting_customer_form',
          'form_link_sent', 'form_pending'
        )
        OR co.stage IN (
          'under_review', 'in_progress', 'submitted_to_govt', 'under_processing', 'certificate_ready',
          'refunded', 'refund_requested'
        )
        OR co.form_link_sent_at IS NOT NULL
          THEN 'Action Taken'
        ELSE 'Action Required'
      END AS action_status_label,
      -- Pending age in days
      FLOOR(EXTRACT(EPOCH FROM (v_now - co.created_at)) / 86400)::int AS age_in_days
    FROM computed_orders co
  ),
  base_filtered_orders AS (
    SELECT co.*
    FROM classified_orders co
    WHERE
      -- Stage Filter
      (
        p_stage IS NULL OR p_stage = 'all' OR co.stage = p_stage
      )
      -- Fulfillment Status Filter
      AND (
        p_fulfillment_status IS NULL OR p_fulfillment_status = 'all' OR co.fulfillment_status::text = p_fulfillment_status
      )
      -- Action Status Filter
      AND (
        p_action_status IS NULL OR p_action_status = 'all'
        OR (p_action_status = 'action_required' AND co.bucket IN ('needs_action', 'backlog'))
        OR (p_action_status IN ('processed', 'action_taken') AND (
          co.stage IN ('technical_delay', 'customer_delay', 'completed')
          OR co.fulfillment_status::text IN ('technical_delay', 'customer_delay', 'consultation_completed', 'order_completed', 'completed')
          OR co.is_callback_scheduled = true
        ))
        OR (p_action_status = 'hot_orders' AND co.bucket = 'hot_orders')
        OR (p_action_status = 'scheduled_callback' AND co.bucket = 'reminders')
      )
      -- Payment Status Filter
      AND (
        p_payment_status IS NULL OR p_payment_status = 'all' OR co.payment_status = p_payment_status
      )
      -- Pending Age Filter
      AND (
        p_pending_age IS NULL OR p_pending_age = 'any'
        OR (p_pending_age = 'custom' AND p_custom_days IS NOT NULL AND co.age_in_days >= p_custom_days)
        OR (p_pending_age ~ '^[0-9]+$' AND co.age_in_days >= p_pending_age::int)
      )
  ),
  global_counts AS (
    SELECT
      -- In-range volume count (created in date range)
      COUNT(CASE WHEN in_range_created = true THEN 1 END)::int AS all_count,
      -- Operational Queues: All-time active portfolio counts
      COUNT(CASE WHEN NOT is_terminal AND stage IN ('lead_received', 'payment_done', 'form_submitted', 'form_not_submitted') THEN 1 END)::int AS needs_action_count,
      COUNT(CASE WHEN is_hot THEN 1 END)::int AS hot_orders_count,
      COUNT(CASE WHEN is_callback_scheduled THEN 1 END)::int AS reminders_count,
      COUNT(CASE WHEN NOT is_terminal AND stage = 'technical_delay' THEN 1 END)::int AS technical_delay_count,
      COUNT(CASE WHEN NOT is_terminal AND stage IN ('lead_received', 'payment_done', 'form_submitted', 'form_not_submitted') AND is_older_than_today THEN 1 END)::int AS backlog_count,
      COUNT(CASE WHEN NOT is_terminal AND stage = 'customer_delay' THEN 1 END)::int AS customer_delay_count,
      -- Action Taken: orders in technical delay, customer delay, scheduled callback, or completed
      COUNT(CASE WHEN (
        stage = 'technical_delay'
        OR stage = 'customer_delay'
        OR is_callback_scheduled = true
        OR (in_range_completed = true AND (fulfillment_status::text IN ('consultation_completed', 'order_completed', 'completed') OR stage = 'completed'))
      ) THEN 1 END)::int AS pending_count,
      -- Completed in range
      COUNT(CASE WHEN in_range_completed = true AND (fulfillment_status::text IN ('consultation_completed', 'order_completed', 'completed') OR stage = 'completed') THEN 1 END)::int AS completed_count,
      -- Closed in range
      COUNT(CASE WHEN in_range_closed = true AND (fulfillment_status::text IN ('application_rejected', 'certificate_rejected', 'order_closed', 'cancelled') OR stage = 'closed') THEN 1 END)::int AS closed_count,
      COUNT(CASE WHEN in_range_created = true AND stage IN ('refund_requested', 'refunded', 'uninterested') THEN 1 END)::int AS exception_count,
      COUNT(CASE WHEN NOT is_terminal AND stage IN ('lead_received', 'payment_done', 'form_submitted', 'form_not_submitted') THEN 1 END)::int AS action_required_count,
      COUNT(CASE WHEN (in_range_completed = true AND (fulfillment_status::text IN ('consultation_completed', 'order_completed', 'completed') OR stage = 'completed')) OR (in_range_closed = true AND (fulfillment_status::text IN ('application_rejected', 'certificate_rejected', 'order_closed', 'cancelled') OR stage = 'closed')) THEN 1 END)::int AS processed_count,
      COUNT(CASE WHEN in_range_created = true THEN 1 END)::int AS total_all_count,
      -- Age buckets for pending / needs_action / backlog
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action', 'backlog') AND age_in_days < 1 THEN 1 END)::int AS d1_count,
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action', 'backlog') AND age_in_days = 1 THEN 1 END)::int AS d2_count,
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action', 'backlog') AND age_in_days = 2 THEN 1 END)::int AS d3_count,
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action', 'backlog') AND age_in_days >= 3 AND age_in_days < 7 THEN 1 END)::int AS d7_count,
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action', 'backlog') AND age_in_days >= 7 THEN 1 END)::int AS older_count
    FROM base_filtered_orders
  ),
  filtered_orders AS (
    SELECT bfo.*
    FROM base_filtered_orders bfo
    WHERE
      (
        -- 1. All Orders tab: in-range created orders, excluding terminal completed/closed for active portfolio view
        (p_bucket IS NULL OR p_bucket = 'all') AND bfo.in_range_created = true AND bfo.bucket NOT IN ('completed', 'closed')
      )
      OR (
        -- 2. Needs Action tab: all active action-needed orders across all time
        p_bucket = 'needs_action' AND NOT bfo.is_terminal AND bfo.stage IN ('lead_received', 'payment_done', 'form_submitted', 'form_not_submitted')
      )
      OR (
        -- 3. Hot Orders tab: all active hot orders across all time
        p_bucket = 'hot_orders' AND bfo.is_hot = true
      )
      OR (
        -- 4. Reminders / Call Back Scheduled tab: all active scheduled callbacks across all time
        p_bucket = 'reminders' AND bfo.is_callback_scheduled = true
      )
      OR (
        -- 5. Backlog tab: untouched action-needed orders older than today (< today IST)
        p_bucket = 'backlog' AND NOT bfo.is_terminal AND bfo.stage IN ('lead_received', 'payment_done', 'form_submitted', 'form_not_submitted') AND bfo.is_older_than_today = true
      )
      OR (
        -- 6. Technical Delay tab
        p_bucket = 'technical_delay' AND NOT bfo.is_terminal AND bfo.stage = 'technical_delay'
      )
      OR (
        -- 7. Customer Delay tab
        p_bucket = 'customer_delay' AND NOT bfo.is_terminal AND bfo.stage = 'customer_delay'
      )
      OR (
        -- 8. Action Taken tab: orders in technical delay, customer delay, scheduled callback, or completed
        p_bucket = 'pending' AND (
          bfo.stage = 'technical_delay'
          OR bfo.stage = 'customer_delay'
          OR bfo.is_callback_scheduled = true
          OR (bfo.in_range_completed = true AND (bfo.fulfillment_status::text IN ('consultation_completed', 'order_completed', 'completed') OR bfo.stage = 'completed'))
        )
      )
      OR (
        -- 9. Completed tab: in-range completed orders (completed in date range regardless of created_at)
        p_bucket = 'completed' AND bfo.in_range_completed = true AND (bfo.fulfillment_status::text IN ('consultation_completed', 'order_completed', 'completed') OR bfo.stage = 'completed')
      )
      OR (
        -- 10. Closed tab: in-range closed orders (closed in date range regardless of created_at)
        p_bucket = 'closed' AND bfo.in_range_closed = true AND (bfo.fulfillment_status::text IN ('application_rejected', 'certificate_rejected', 'order_closed', 'cancelled') OR bfo.stage = 'closed')
      )
      OR (
        -- 11. Exception tab
        p_bucket = 'exception' AND bfo.in_range_created = true AND bfo.stage IN ('refund_requested', 'refunded', 'uninterested')
      )
  ),
  sorted_orders AS (
    SELECT fo.*
    FROM filtered_orders fo
    ORDER BY
      -- Backlog default: Oldest first
      CASE WHEN p_bucket = 'backlog' AND (p_sort_field IS NULL OR p_sort_field = 'created_at') AND p_sort_order = 'asc' THEN fo.created_at END ASC,
      CASE WHEN p_bucket = 'backlog' AND (p_sort_field IS NULL OR p_sort_field = 'created_at') AND p_sort_order = 'desc' THEN fo.created_at END DESC,
      -- Hot Orders default: Due earliest first
      CASE WHEN p_bucket = 'hot_orders' AND (p_sort_field IS NULL OR p_sort_field = 'created_at') THEN fo.scheduler_fires_at END ASC NULLS LAST,
      -- Standard sorting
      CASE WHEN (p_bucket NOT IN ('backlog', 'hot_orders') OR p_sort_field <> 'created_at') AND p_sort_field = 'created_at' AND p_sort_order = 'desc' THEN fo.created_at END DESC,
      CASE WHEN (p_bucket NOT IN ('backlog', 'hot_orders') OR p_sort_field <> 'created_at') AND p_sort_field = 'created_at' AND p_sort_order = 'asc' THEN fo.created_at END ASC,
      CASE WHEN p_sort_field = 'stage' AND p_sort_order = 'asc' THEN fo.stage END ASC,
      CASE WHEN p_sort_field = 'stage' AND p_sort_order = 'desc' THEN fo.stage END DESC,
      fo.created_at DESC,
      fo.id DESC
    LIMIT v_page_size
    OFFSET v_offset
  ),
  paged_rows AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', so.id,
        'application_code', so.application_code,
        'fulfillment_status', so.fulfillment_status,
        'lead_status_v2', so.lead_status_v2,
        'created_at', so.created_at,
        'lead_id', so.lead_id,
        'lead_code', so.lead_code,
        'customer_id', so.customer_id,
        'customer_name', so.customer_name,
        'customer_mobile', so.customer_mobile,
        'customer_email', so.customer_email,
        'service_id', so.service_id,
        'service_name', so.service_name,
        'total_amount', so.total_amount,
        'payment_status', so.payment_status,
        'assigned_to', so.assigned_to,
        'assigned_name', so.assigned_name,
        'stage', so.stage,
        'is_hot', so.is_hot,
        'is_callback_scheduled', so.is_callback_scheduled,
        'callback_reminder', CASE
          WHEN so.scheduler_id IS NOT NULL THEN
            jsonb_build_object(
              'id', so.scheduler_id,
              'fires_at', so.scheduler_fires_at,
              'is_due', (so.scheduler_fires_at <= v_now),
              'remarks', CASE
                WHEN so.scheduler_remarks IS NULL THEN NULL
                WHEN jsonb_typeof(so.scheduler_remarks::jsonb) IS NOT NULL THEN so.scheduler_remarks::jsonb
                ELSE jsonb_build_object('reason', 'custom', 'reasonLabel', so.scheduler_remarks)
              END,
              'created_at', so.scheduler_created_at
            )
          ELSE NULL
        END
      )
    ) AS rows_json
    FROM sorted_orders so
  ),
  total_count AS (
    SELECT COUNT(*)::int AS total FROM filtered_orders
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT rows_json FROM paged_rows), '[]'::jsonb),
    'total', COALESCE((SELECT total FROM total_count), 0),
    'counts', jsonb_build_object(
      'all', (SELECT all_count FROM global_counts),
      'needs_action', (SELECT needs_action_count FROM global_counts),
      'hot_orders', (SELECT hot_orders_count FROM global_counts),
      'reminders', (SELECT reminders_count FROM global_counts),
      'technical_delay', (SELECT technical_delay_count FROM global_counts),
      'backlog', (SELECT backlog_count FROM global_counts),
      'customer_delay', (SELECT customer_delay_count FROM global_counts),
      'pending', (SELECT pending_count FROM global_counts),
      'completed', (SELECT completed_count FROM global_counts),
      'closed', (SELECT closed_count FROM global_counts),
      'exception', (SELECT exception_count FROM global_counts),
      'actionRequired', (SELECT action_required_count FROM global_counts),
      'processed', (SELECT processed_count FROM global_counts),
      'totalAll', (SELECT total_all_count FROM global_counts)
    ),
    'ageBuckets', jsonb_build_object(
      'd1', (SELECT d1_count FROM global_counts),
      'd2', (SELECT d2_count FROM global_counts),
      'd3', (SELECT d3_count FROM global_counts),
      'd7', (SELECT d7_count FROM global_counts),
      'older', (SELECT older_count FROM global_counts)
    ),
    'page', v_page,
    'pageSize', v_page_size
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_v3_paged TO authenticated, anon, service_role, postgres;

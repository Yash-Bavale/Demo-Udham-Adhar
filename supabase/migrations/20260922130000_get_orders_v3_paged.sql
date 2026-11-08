-- Migration: 20260922130000_get_orders_v3_paged.sql
-- Description: Orders Performance Rebuild - Database-side filtering, aggregation, and pagination for Orders V3
-- Eliminates fetching thousands of rows to JavaScript. Returns only the visible page (default 50) + exact tab counts.

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
      COALESCE(p.display_name, p.email) AS assigned_name,
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
      os.scheduler_type
    FROM applications a
    LEFT JOIN leads l ON a.lead_id = l.id
    LEFT JOIN customers c ON a.customer_id = c.id
    LEFT JOIN services s ON s.id = COALESCE(a.service_id, l.service_id)
    LEFT JOIN profiles p ON a.assigned_to = p.id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(CASE WHEN pay.status IN ('paid', 'success', 'successful') THEN pay.amount ELSE 0 END), 0) AS paid_sum,
        COUNT(pay.id) AS payment_count,
        COUNT(CASE WHEN pay.amount < 0 OR pay.status = 'refunded' THEN 1 END) AS refund_count,
        COUNT(CASE WHEN pay.amount >= 0 THEN 1 END) AS positive_count,
        COUNT(CASE WHEN pay.amount >= 0 AND pay.status = 'refunded' THEN 1 END) AS refunded_positive_count,
        COUNT(CASE WHEN pay.amount >= 0 AND pay.status IN ('failed', 'cancelled') THEN 1 END) AS failed_positive_count,
        MIN(CASE WHEN pay.status IN ('paid', 'success', 'successful') THEN pay.payment_date END) AS earliest_paid_at
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
      -- Date bounds
      AND (
        p_date_from IS NULL
        OR a.created_at >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR a.created_at <= p_date_to
      )
      -- Search
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
      -- 1. Compute Order Stage
      CASE
        -- Exception / Refund
        WHEN bc.lead_status_v2 IN ('refunded', 'closed_refunded', 'refund_approved')
          OR bc.lead_status IN ('refunded', 'closed_refunded', 'refund_approved')
          OR bc.fulfillment_status = 'refunded'
          OR bc.refund_processed_at IS NOT NULL
          OR bc.closure_stage = 'refund_approved'
          OR bc.refund_approved_at IS NOT NULL
          OR bc.workflow_status = 'refund_closed'
          OR bc.refund_req_status IN ('approved', 'processed')
        THEN 'refunded'

        WHEN bc.lead_status_v2 = 'refund_requested'
          OR bc.lead_status = 'refund_requested'
          OR bc.workflow_status = 'refund_review'
          OR bc.closure_stage = 'refund_requested'
          OR bc.refund_req_status IN ('pending', 'info_needed', 'escalated')
        THEN 'refund_requested'

        WHEN bc.lead_status_v2 = 'uninterested' OR bc.lead_status = 'uninterested'
        THEN 'uninterested'

        -- Terminals
        WHEN bc.fulfillment_status IN ('completed', 'order_completed') OR bc.application_status = 'completed'
        THEN 'completed'

        WHEN bc.fulfillment_status IN ('order_closed', 'cancelled')
          OR bc.workflow_status = 'closed'
          OR bc.application_status = 'closed'
          OR bc.closure_stage IN ('closed', 'final_ticket_closed')
        THEN 'closed'

        -- S09/S10 near-terminals
        WHEN bc.fulfillment_status = 'application_approved'
        THEN 'certificate_ready'

        WHEN bc.fulfillment_status IN ('application_rejected', 'certificate_rejected')
        THEN 'submitted_to_govt'

        WHEN bc.certificate_uploaded_at IS NOT NULL
        THEN 'certificate_ready'

        -- S07 Government Processing
        WHEN bc.fulfillment_status IN ('government_processing', 'application_submitted', 'under_processing', 'awaiting_govt')
        THEN 'submitted_to_govt'

        -- Legacy interim stages
        WHEN bc.fulfillment_status = 'verification_pending'
        THEN 'under_review'

        WHEN bc.fulfillment_status = 'documents_received'
        THEN 'in_progress'

        WHEN bc.fulfillment_status = 'customer_delay'
          OR bc.workflow_status IN ('waiting_for_customer', 'waiting_for_documents', 'customer_non_responsive', 'customer_delay')
        THEN 'customer_delay'

        WHEN bc.fulfillment_status IN ('technical_delay', 'technical_hold')
          OR bc.workflow_status IN ('government_portal_pending', 'technical_hold', 'external_dependency')
        THEN 'technical_delay'

        WHEN bc.fulfillment_status = 'order_reopened'
          OR bc.application_status = 'order_reopened'
          OR bc.order_status = 'REOPENED'
        THEN 'order_reopened'

        WHEN bc.fulfillment_status = 'consultation_completed'
        THEN 'consultation_completed'

        WHEN bc.application_status IN ('consultation_pending', 'consultation_scheduled')
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

        WHEN bc.fulfillment_status = 'form_submitted'
        THEN 'form_submitted'

        WHEN bc.fulfillment_status IN ('waiting_for_customer_submission', 'awaiting_customer_form', 'form_not_submitted', 'form_pending', 'waiting_customer', 'customer_form_pending')
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
        bc.fulfillment_status IN ('completed', 'order_completed', 'order_closed', 'cancelled', 'application_rejected', 'certificate_rejected', 'consultation_completed')
        OR lower(COALESCE(bc.application_status, '')) IN ('completed', 'closed', 'cancelled')
        OR lower(COALESCE(bc.order_status, '')) IN ('completed', 'closed', 'cancelled')
        OR lower(COALESCE(bc.workflow_status, '')) IN ('completed', 'closed', 'cancelled')
      ) AS is_terminal,

      -- 4. Is Reopened helper
      (
        bc.fulfillment_status = 'order_reopened'
        OR bc.application_status = 'order_reopened'
        OR bc.order_status = 'REOPENED'
      ) AS is_reopened_raw,

      -- 5. Is Due helper
      (bc.scheduler_fires_at IS NOT NULL AND bc.scheduler_fires_at <= v_now) AS is_due_raw
    FROM base_candidates bc
  ),
  classified_orders AS (
    SELECT
      co.*,
      -- Hot order logic
      (NOT co.is_terminal AND (co.is_due_raw OR co.is_reopened_raw OR co.stage = 'order_reopened')) AS is_hot,
      -- Callback scheduled logic
      (NOT co.is_terminal AND (co.scheduler_id IS NOT NULL OR co.is_reopened_raw OR co.stage = 'order_reopened')) AS is_callback_scheduled,
      -- Tab Bucket
      CASE
        WHEN co.stage IN ('refund_requested', 'refunded', 'uninterested') THEN 'exception'
        WHEN co.fulfillment_status IN ('application_rejected', 'certificate_rejected', 'order_closed', 'cancelled') OR co.stage = 'closed' THEN 'closed'
        WHEN co.fulfillment_status IN ('consultation_completed', 'order_completed', 'completed') OR co.stage = 'completed' THEN 'completed'
        WHEN (NOT co.is_terminal AND (co.is_due_raw OR co.is_reopened_raw OR co.stage = 'order_reopened')) THEN 'needs_action'
        WHEN (NOT co.is_terminal AND (co.scheduler_id IS NOT NULL OR co.is_reopened_raw OR co.stage = 'order_reopened')) THEN 'pending'
        WHEN co.stage IN ('lead_received', 'payment_done', 'form_submitted', 'order_reopened') THEN 'needs_action'
        ELSE 'pending'
      END AS bucket,
      -- Action Status
      CASE
        WHEN (NOT co.is_terminal AND (co.is_due_raw OR co.is_reopened_raw OR co.stage = 'order_reopened'))
          THEN 'Call Due Now'
        WHEN (NOT co.is_terminal AND (co.scheduler_id IS NOT NULL OR co.is_reopened_raw OR co.stage = 'order_reopened'))
          THEN 'Scheduled Callback'
        WHEN co.fulfillment_status IN ('order_closed', 'cancelled') OR co.stage = 'closed'
          THEN 'Order Closed'
        WHEN co.fulfillment_status IN ('application_approved', 'consultation_completed', 'order_completed', 'completed') OR co.stage = 'completed'
          THEN 'Completed'
        WHEN co.fulfillment_status IN (
          'government_processing', 'technical_delay', 'customer_delay', 'application_rejected',
          'certificate_rejected', 'under_processing', 'application_submitted', 'verification_pending',
          'documents_received', 'waiting_for_customer_submission', 'awaiting_customer_form',
          'form_link_sent', 'form_pending'
        )
        OR co.stage IN (
          'technical_delay', 'customer_delay', 'consultation_completed', 'under_review',
          'in_progress', 'submitted_to_govt', 'under_processing', 'certificate_ready',
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
  global_counts AS (
    SELECT
      COUNT(*)::int AS all_count,
      COUNT(CASE WHEN bucket = 'needs_action' THEN 1 END)::int AS needs_action_count,
      COUNT(CASE WHEN bucket = 'pending' THEN 1 END)::int AS pending_count,
      COUNT(CASE WHEN bucket = 'completed' THEN 1 END)::int AS completed_count,
      COUNT(CASE WHEN bucket = 'closed' THEN 1 END)::int AS closed_count,
      COUNT(CASE WHEN bucket = 'exception' THEN 1 END)::int AS exception_count,
      COUNT(CASE WHEN is_callback_scheduled = true THEN 1 END)::int AS reminders_count,
      COUNT(CASE WHEN is_hot = true THEN 1 END)::int AS hot_orders_count,
      COUNT(CASE WHEN bucket = 'needs_action' THEN 1 END)::int AS action_required_count,
      COUNT(CASE WHEN bucket IN ('completed', 'closed') THEN 1 END)::int AS processed_count,
      -- Age buckets for pending / needs_action
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action') AND age_in_days < 1 THEN 1 END)::int AS d1_count,
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action') AND age_in_days = 1 THEN 1 END)::int AS d2_count,
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action') AND age_in_days = 2 THEN 1 END)::int AS d3_count,
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action') AND age_in_days >= 3 AND age_in_days < 7 THEN 1 END)::int AS d7_count,
      COUNT(CASE WHEN bucket IN ('pending', 'needs_action') AND age_in_days >= 7 THEN 1 END)::int AS older_count
    FROM classified_orders
  ),
  filtered_orders AS (
    SELECT co.*
    FROM classified_orders co
    WHERE
      -- Tab Bucket Filter
      (
        p_bucket IS NULL OR p_bucket = 'all'
        OR (p_bucket = 'needs_action' AND co.bucket = 'needs_action')
        OR (p_bucket = 'pending' AND co.bucket = 'pending')
        OR (p_bucket = 'completed' AND co.bucket = 'completed')
        OR (p_bucket = 'closed' AND co.bucket = 'closed')
        OR (p_bucket = 'exception' AND co.bucket = 'exception')
        OR (p_bucket = 'reminders' AND co.is_callback_scheduled = true)
        OR (p_bucket = 'hot_orders' AND co.is_hot = true)
      )
      -- Stage Filter
      AND (
        p_stage IS NULL OR p_stage = 'all' OR co.stage = p_stage
      )
      -- Fulfillment Status Filter
      AND (
        p_fulfillment_status IS NULL OR p_fulfillment_status = 'all' OR co.fulfillment_status = p_fulfillment_status
      )
      -- Action Status Filter
      AND (
        p_action_status IS NULL OR p_action_status = 'all'
        OR (p_action_status = 'action_required' AND co.bucket = 'needs_action')
        OR (p_action_status = 'processed' AND co.bucket <> 'needs_action')
        OR (p_action_status = 'hot_orders' AND co.is_hot = true)
        OR (p_action_status = 'scheduled_callback' AND co.is_callback_scheduled = true AND co.is_hot = false)
      )
      -- Payment Status Filter
      AND (
        p_payment_status IS NULL OR p_payment_status = 'all' OR co.payment_status = p_payment_status
      )
      -- Pending Age Filter
      AND (
        p_pending_age IS NULL OR p_pending_age = 'any'
        OR (p_pending_age = '1' AND co.age_in_days >= 1)
        OR (p_pending_age = '2' AND co.age_in_days >= 2)
        OR (p_pending_age = '3' AND co.age_in_days >= 3)
        OR (p_pending_age = '7' AND co.age_in_days >= 7)
        OR (p_pending_age = 'custom' AND p_custom_days IS NOT NULL AND co.age_in_days >= p_custom_days)
      )
  ),
  total_count_cte AS (
    SELECT COUNT(*)::int AS total FROM filtered_orders
  ),
  paged_orders AS (
    SELECT fo.*
    FROM filtered_orders fo
    ORDER BY
      -- Hot orders float on top
      fo.is_hot DESC,
      CASE WHEN p_sort_field = 'stage' AND p_sort_order = 'asc' THEN fo.stage END ASC,
      CASE WHEN p_sort_field = 'stage' AND p_sort_order = 'desc' THEN fo.stage END DESC,
      CASE WHEN p_sort_order = 'asc' THEN fo.created_at END ASC,
      fo.created_at DESC
    LIMIT v_page_size
    OFFSET v_offset
  ),
  aggregated_rows AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', po.id,
          'application_code', po.application_code,
          'fulfillment_status', po.fulfillment_status,
          'lead_status_v2', po.lead_status_v2,
          'created_at', po.created_at,
          'lead_id', po.lead_id,
          'lead_code', po.lead_code,
          'customer_id', po.customer_id,
          'customer_name', po.customer_name,
          'customer_mobile', po.customer_mobile,
          'customer_email', po.customer_email,
          'service_id', po.service_id,
          'service_name', po.service_name,
          'total_amount', po.total_amount,
          'payment_status', po.payment_status,
          'assigned_to', po.assigned_to,
          'assigned_name', po.assigned_name,
          'stage', po.stage,
          'is_hot', po.is_hot,
          'is_callback_scheduled', po.is_callback_scheduled,
          'callback_reminder', CASE
            WHEN NOT po.is_terminal AND po.scheduler_id IS NOT NULL THEN
              jsonb_build_object(
                'id', po.scheduler_id,
                'fires_at', po.scheduler_fires_at,
                'is_due', po.is_due_raw,
                'remarks', po.scheduler_remarks,
                'created_at', po.scheduler_created_at
              )
            ELSE NULL
          END
        )
      ),
      '[]'::jsonb
    ) AS rows_json
    FROM paged_orders po
  )
  SELECT jsonb_build_object(
    'rows', ar.rows_json,
    'total', tc.total,
    'counts', jsonb_build_object(
      'all', gc.all_count,
      'needs_action', gc.needs_action_count,
      'pending', gc.pending_count,
      'completed', gc.completed_count,
      'closed', gc.closed_count,
      'exception', gc.exception_count,
      'actionRequired', gc.action_required_count,
      'processed', gc.processed_count,
      'reminders', gc.reminders_count,
      'hot_orders', gc.hot_orders_count
    ),
    'ageBuckets', jsonb_build_object(
      'd1', gc.d1_count,
      'd2', gc.d2_count,
      'd3', gc.d3_count,
      'd7', gc.d7_count,
      'older', gc.older_count
    ),
    'page', v_page,
    'pageSize', v_page_size
  )
  INTO v_result
  FROM aggregated_rows ar
  CROSS JOIN total_count_cte tc
  CROSS JOIN global_counts gc;

  RETURN v_result;
END;
$$;

-- Add targeted database indexes for Orders query performance
CREATE INDEX IF NOT EXISTS idx_applications_is_deleted_created_at ON public.applications (is_deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_assigned_to ON public.applications (assigned_to) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_applications_service_id ON public.applications (service_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_applications_lead_id ON public.applications (lead_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_applications_customer_id ON public.applications (customer_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_payments_application_lead ON public.payments (application_id, lead_id, status);
CREATE INDEX IF NOT EXISTS idx_order_schedulers_app_active ON public.order_schedulers (application_id, status, fires_at) WHERE status = 'active';

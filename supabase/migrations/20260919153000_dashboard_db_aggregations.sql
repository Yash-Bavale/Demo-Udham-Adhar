-- Database-side aggregation RPC functions for Executive / Super Admin Dashboard
-- Completely eliminates downloading thousands of rows to Node.js/browser

CREATE OR REPLACE FUNCTION public.get_dashboard_revenue_aggregates(
  p_start timestamptz,
  p_end timestamptz,
  p_prev_start timestamptz,
  p_prev_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur_total numeric;
  v_cur_base numeric;
  v_cur_gst numeric;
  v_cur_count bigint;
  v_prev_total numeric;
  v_prev_count bigint;
  v_payu_total numeric;
  v_gateways jsonb;
BEGIN
  -- Current period aggregates
  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(COALESCE(base_amount, amount / 1.18)), 0),
    COALESCE(SUM(COALESCE(gst_amount, amount - (amount / 1.18))), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN lower(gateway_name) = 'payu' THEN amount ELSE 0 END), 0)
  INTO 
    v_cur_total,
    v_cur_base,
    v_cur_gst,
    v_cur_count,
    v_payu_total
  FROM payments
  WHERE status = 'paid'
    AND created_at >= p_start
    AND created_at < p_end;

  -- Previous period aggregates
  SELECT 
    COALESCE(SUM(amount), 0),
    COUNT(*)
  INTO 
    v_prev_total,
    v_prev_count
  FROM payments
  WHERE status = 'paid'
    AND created_at >= p_prev_start
    AND created_at < p_prev_end;

  -- Gateway breakdown
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code', lower(COALESCE(gateway_name, 'payu')),
        'revenue', COALESCE(sum_amt, 0),
        'count', COALESCE(cnt, 0)
      ) ORDER BY sum_amt DESC
    ),
    '[]'::jsonb
  )
  INTO v_gateways
  FROM (
    SELECT 
      lower(COALESCE(gateway_name, 'payu')) as gateway_name,
      SUM(amount) as sum_amt,
      COUNT(*) as cnt
    FROM payments
    WHERE status = 'paid'
      AND created_at >= p_start
      AND created_at < p_end
    GROUP BY lower(COALESCE(gateway_name, 'payu'))
  ) gw;

  RETURN jsonb_build_object(
    'revenue_incl_tax', v_cur_total,
    'revenue_excl_tax', v_cur_base,
    'tax_collected', v_cur_gst,
    'paid_payments_count', v_cur_count,
    'revenue_prev', v_prev_total,
    'paid_payments_prev_count', v_prev_count,
    'payu_revenue', v_payu_total,
    'gateways', v_gateways
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_chart_aggregates(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_leads jsonb;
  v_daily_orders jsonb;
  v_daily_rev jsonb;
  v_hourly_leads jsonb;
  v_hourly_orders jsonb;
  v_hourly_rev jsonb;
BEGIN
  -- Daily leads
  SELECT COALESCE(jsonb_object_agg(d, cnt), '{}'::jsonb)
  INTO v_daily_leads
  FROM (
    SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as d, COUNT(*) as cnt
    FROM leads
    WHERE created_at >= p_start AND created_at < p_end
    GROUP BY 1
  ) t;

  -- Daily orders
  SELECT COALESCE(jsonb_object_agg(d, cnt), '{}'::jsonb)
  INTO v_daily_orders
  FROM (
    SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as d, COUNT(*) as cnt
    FROM applications
    WHERE is_deleted = false AND created_at >= p_start AND created_at < p_end
    GROUP BY 1
  ) t;

  -- Daily revenue
  SELECT COALESCE(jsonb_object_agg(d, rev), '{}'::jsonb)
  INTO v_daily_rev
  FROM (
    SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as d, SUM(amount) as rev
    FROM payments
    WHERE status = 'paid' AND created_at >= p_start AND created_at < p_end
    GROUP BY 1
  ) t;

  -- Hourly leads
  SELECT COALESCE(jsonb_object_agg(lpad(h::text, 2, '0') || ':00', cnt), '{}'::jsonb)
  INTO v_hourly_leads
  FROM (
    SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Kolkata'))::int as h, COUNT(*) as cnt
    FROM leads
    WHERE created_at >= p_start AND created_at < p_end
    GROUP BY 1
  ) t;

  -- Hourly orders
  SELECT COALESCE(jsonb_object_agg(lpad(h::text, 2, '0') || ':00', cnt), '{}'::jsonb)
  INTO v_hourly_orders
  FROM (
    SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Kolkata'))::int as h, COUNT(*) as cnt
    FROM applications
    WHERE is_deleted = false AND created_at >= p_start AND created_at < p_end
    GROUP BY 1
  ) t;

  -- Hourly revenue
  SELECT COALESCE(jsonb_object_agg(lpad(h::text, 2, '0') || ':00', rev), '{}'::jsonb)
  INTO v_hourly_rev
  FROM (
    SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Kolkata'))::int as h, SUM(amount) as rev
    FROM payments
    WHERE status = 'paid' AND created_at >= p_start AND created_at < p_end
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'daily_leads', v_daily_leads,
    'daily_orders', v_daily_orders,
    'daily_rev', v_daily_rev,
    'hourly_leads', v_hourly_leads,
    'hourly_orders', v_hourly_orders,
    'hourly_rev', v_hourly_rev
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_top_services(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_services jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', name,
        'orders', orders,
        'revenueInr', revenue_inr
      )
    ),
    '[]'::jsonb
  )
  INTO v_services
  FROM (
    SELECT 
      COALESCE(s.service_name, 'Unknown') as name,
      COUNT(a.id)::int as orders,
      COALESCE(SUM(COALESCE(l.total_amount, 0)), 0)::numeric as revenue_inr
    FROM applications a
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN leads l ON l.id = a.lead_id
    WHERE a.is_deleted = false
      AND a.created_at >= p_start
      AND a.created_at < p_end
    GROUP BY 1
    ORDER BY 3 DESC
    LIMIT 6
  ) top_svc;

  RETURN v_services;
END;
$$;

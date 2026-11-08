CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'totalLeads',       (SELECT count(*) FROM public.leads),
    'todayLeads',       (SELECT count(*) FROM public.leads WHERE created_at >= date_trunc('day', now())),
    'weekLeads',        (SELECT count(*) FROM public.leads WHERE created_at >= now() - interval '7 days'),
    'inProgress',       (SELECT count(*) FROM public.applications WHERE application_status IN ('details_pending','documents_pending','under_review','under_process')),
    'completed',        (SELECT count(*) FROM public.applications
                          WHERE application_status = 'completed'
                             OR fulfillment_status::text IN ('completed','order_completed','consultation_completed')),
    'pending',          (SELECT count(*) FROM public.applications WHERE application_status = 'awaiting_payment'),
    'uniqueCustomers',  (SELECT count(*) FROM public.customers),
    'uniqueEmails',     (SELECT count(DISTINCT lower(email)) FROM public.leads WHERE email IS NOT NULL),
    'uniqueMobiles',    (SELECT count(DISTINCT regexp_replace(mobile,'\D','','g')) FROM public.leads WHERE mobile IS NOT NULL),
    'statusDistribution',  (SELECT coalesce(jsonb_agg(jsonb_build_object('label', status, 'value', c) ORDER BY c DESC), '[]'::jsonb)
                            FROM (SELECT coalesce(status::text,'unknown') AS status, count(*) c FROM public.leads GROUP BY 1) s),
    'serviceDistribution', (SELECT coalesce(jsonb_agg(jsonb_build_object('label', service, 'value', c) ORDER BY c DESC), '[]'::jsonb)
                            FROM (SELECT coalesce(service::text,'unknown') AS service, count(*) c FROM public.leads GROUP BY 1) s),
    'trend',               (SELECT coalesce(jsonb_agg(jsonb_build_object('date', to_char(d,'MM-DD'), 'count', coalesce(c,0)) ORDER BY d), '[]'::jsonb)
                            FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
                            LEFT JOIN (SELECT date_trunc('day', created_at) AS day, count(*) c
                                       FROM public.leads
                                       WHERE created_at >= now() - interval '30 days'
                                       GROUP BY 1) x ON x.day = d)
  ) INTO result;
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;
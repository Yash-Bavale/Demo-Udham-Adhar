-- Retention/maintenance routines to cut storage and query load.

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events (created_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_status_created ON public.email_queue (status, created_at);

CREATE OR REPLACE FUNCTION public.prune_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications WHERE created_at < now() - interval '48 hours';

  DELETE FROM public.notifications n
  USING (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM public.notifications
  ) ranked
  WHERE n.id = ranked.id AND ranked.rn > 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_sent_email_bodies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.email_queue
  SET body_html = NULL
  WHERE body_html IS NOT NULL
    AND status::text IN ('sent', 'delivered')
    AND created_at < now() - interval '24 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.analytics_events WHERE created_at < now() - interval '30 days';
END;
$$;

SELECT cron.schedule('prune-notifications', '7 * * * *', $$SELECT public.prune_notifications();$$);
SELECT cron.schedule('prune-sent-email-bodies', '23 * * * *', $$SELECT public.prune_sent_email_bodies();$$);
SELECT cron.schedule('prune-analytics-events', '41 3 * * *', $$SELECT public.prune_analytics_events();$$);

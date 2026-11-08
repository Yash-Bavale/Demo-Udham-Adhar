CREATE OR REPLACE FUNCTION public.prune_sent_email_bodies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.email_queue
  SET body_html = ''
  WHERE body_html <> ''
    AND status::text IN ('sent', 'delivered')
    AND created_at < now() - interval '24 hours';
END;
$$;
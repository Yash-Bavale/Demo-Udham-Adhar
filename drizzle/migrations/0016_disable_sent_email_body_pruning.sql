-- Stop the recurring job that blanked stored email bodies
DO $$
BEGIN
  PERFORM cron.unschedule('prune-sent-email-bodies');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Neutralise the function so it can never clear stored email bodies again.
CREATE OR REPLACE FUNCTION public.prune_sent_email_bodies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- DEPRECATED: email body retention is disabled by product decision.
  -- Intentionally a no-op; kept so any existing caller does not error.
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.prune_sent_email_bodies() IS 'DEPRECATED: no-op. Email body pruning disabled on request.';

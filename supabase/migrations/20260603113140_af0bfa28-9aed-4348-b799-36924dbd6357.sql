
-- Schedule the email queue dispatcher to run every minute via pg_cron + pg_net.
-- This drains queued payment_success, onboarding_complete, and admin notification
-- emails so customers actually receive invoices in their inbox.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any previous registration so this migration is idempotent.
DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'bhs-process-email-queue' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'bhs-process-email-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://udyamadhar.everythinghappens.in/api/public/cron/process-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY21nZmt5cXlzbHZic2ZrZ3R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDQ5MTcsImV4cCI6MjA5NTcyMDkxN30.bk8fWnW7vJD1hOQF81FHt-aPYTX-qfa2uQ7fN0RX84U'
    ),
    body    := '{}'::jsonb
  );
  $$
);

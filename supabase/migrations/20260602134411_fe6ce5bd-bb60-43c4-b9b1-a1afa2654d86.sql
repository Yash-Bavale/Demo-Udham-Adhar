DO $$
DECLARE
  app_url TEXT := 'https://everythinghappensqindiaserver4cored.lovable.app/api/public/cron/onboarding-reminders';
  apikey  TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY21nZmt5cXlzbHZic2ZrZ3R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDQ5MTcsImV4cCI6MjA5NTcyMDkxN30.bk8fWnW7vJD1hOQF81FHt-aPYTX-qfa2uQ7fN0RX84U';
BEGIN
  PERFORM cron.unschedule('onboarding-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'onboarding-reminders');
  PERFORM cron.schedule(
    'onboarding-reminders',
    '0 * * * *',
    format($f$SELECT net.http_post(url:=%L, headers:=jsonb_build_object('Content-Type','application/json','apikey',%L), body:='{}'::jsonb) AS request_id;$f$, app_url, apikey)
  );
END $$;
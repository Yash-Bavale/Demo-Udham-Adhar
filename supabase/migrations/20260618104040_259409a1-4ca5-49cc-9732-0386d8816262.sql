
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'closure-workflow-hourly') THEN
    PERFORM cron.unschedule('closure-workflow-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'closure-workflow-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b9dc2e49-0e43-4d3d-84b6-7e29ce7bb6d7.lovable.app/api/public/cron/closure-workflow',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY21nZmt5cXlzbHZic2ZrZ3R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDQ5MTcsImV4cCI6MjA5NTcyMDkxN30.bk8fWnW7vJD1hOQF81FHt-aPYTX-qfa2uQ7fN0RX84U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

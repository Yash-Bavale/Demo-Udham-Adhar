
SELECT cron.schedule(
  'cron-workflow-reminders',
  '*/10 * * * *',
  $$SELECT net.http_post(
    url := 'https://project--b9dc2e49-0e43-4d3d-84b6-7e29ce7bb6d7.lovable.app/api/public/cron/workflow-reminders',
    headers := '{"Content-Type":"application/json","apikey":"075aec061d2f94721595e9317e6b139b5ee39b5ab8c30516c9405e3d8b114755"}'::jsonb,
    body := '{}'::jsonb
  );$$
);

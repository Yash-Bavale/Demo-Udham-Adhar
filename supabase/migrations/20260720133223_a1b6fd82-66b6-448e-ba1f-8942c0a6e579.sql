
DO $$
DECLARE
  v_url text := 'https://project--b9dc2e49-0e43-4d3d-84b6-7e29ce7bb6d7.lovable.app/api/public/cron/payu-reconcile';
  v_cron_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_cron_secret := NULL; END;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'payu-reconcile') THEN
    PERFORM cron.unschedule('payu-reconcile');
  END IF;

  PERFORM cron.schedule(
    'payu-reconcile',
    '*/5 * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization', %L),
        body := '{}'::jsonb
      );$cmd$,
      v_url,
      'Bearer ' || COALESCE(v_cron_secret, '')
    )
  );
END $$;

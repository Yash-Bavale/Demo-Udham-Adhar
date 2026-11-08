UPDATE public.email_queue
   SET status = 'queued',
       next_attempt_at = now(),
       last_error = 'auto-recovered: stuck sending — requeued by maintenance'
 WHERE template_code LIKE 'cancel-%'
   AND status = 'sending'
   AND sent_at IS NULL
   AND created_at < now() - interval '15 minutes';
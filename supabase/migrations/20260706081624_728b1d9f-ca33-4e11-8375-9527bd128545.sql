
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;

CREATE POLICY "Public can insert bounded analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_name IS NOT NULL
  AND length(event_name) BETWEEN 1 AND 100
  AND (session_id IS NULL OR length(session_id) <= 100)
  AND (page_url IS NULL OR length(page_url) <= 2048)
  AND (user_agent IS NULL OR length(user_agent) <= 1024)
  AND octet_length(coalesce(metadata::text, '{}')) <= 8192
);

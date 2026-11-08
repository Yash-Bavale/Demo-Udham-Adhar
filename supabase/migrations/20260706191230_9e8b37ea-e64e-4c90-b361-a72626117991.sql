
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS email_thread_message_id text,
  ADD COLUMN IF NOT EXISTS email_thread_subject text;

CREATE INDEX IF NOT EXISTS applications_email_thread_message_id_idx
  ON public.applications(email_thread_message_id)
  WHERE email_thread_message_id IS NOT NULL;

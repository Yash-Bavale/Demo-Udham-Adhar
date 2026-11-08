DELETE FROM public.smtp_settings
WHERE id NOT IN (
  SELECT id FROM public.smtp_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS smtp_settings_singleton_idx
  ON public.smtp_settings ((true));
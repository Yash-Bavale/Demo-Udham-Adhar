ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS email_provider text NOT NULL DEFAULT 'auto';

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_email_provider_check;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_email_provider_check
  CHECK (email_provider IN ('auto', 'zoho', 'zeptomail'));

INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
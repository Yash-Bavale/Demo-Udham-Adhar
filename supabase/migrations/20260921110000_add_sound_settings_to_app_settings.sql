-- Migration to persist company-wide notification & reminder audio settings in public.app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS alert_sound_tone text DEFAULT 'chime',
  ADD COLUMN IF NOT EXISTS custom_audio_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_audio_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS alert_sound_volume numeric DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS alert_sound_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS desktop_notifications boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS leads_sound_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS orders_sound_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS leads_ringtone text DEFAULT 'chime',
  ADD COLUMN IF NOT EXISTS leads_custom_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS leads_custom_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS orders_ringtone text DEFAULT 'bell',
  ADD COLUMN IF NOT EXISTS orders_custom_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS orders_custom_name text DEFAULT NULL;

-- Ensure row 1 exists
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

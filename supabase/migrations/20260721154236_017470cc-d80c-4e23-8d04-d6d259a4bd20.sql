
CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  customer_delay_autoclose_minutes integer NOT NULL DEFAULT 480,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT app_settings_singleton CHECK (id = 1),
  CONSTRAINT app_settings_minutes_range CHECK (customer_delay_autoclose_minutes BETWEEN 15 AND 10080)
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "super admin update app_settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "super admin insert app_settings"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

INSERT INTO public.app_settings (id, customer_delay_autoclose_minutes)
VALUES (1, 480)
ON CONFLICT (id) DO NOTHING;

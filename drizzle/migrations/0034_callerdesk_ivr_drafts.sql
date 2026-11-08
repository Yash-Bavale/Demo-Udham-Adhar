CREATE TABLE public.callerdesk_ivr_settings (
 id text PRIMARY KEY DEFAULT 'primary' CHECK (id = 'primary'),
 config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
 revision integer NOT NULL DEFAULT 1,
 sync_status text NOT NULL DEFAULT 'not_applied' CHECK (sync_status = 'not_applied'),
 updated_by uuid REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.callerdesk_ivr_settings TO authenticated;
GRANT ALL ON public.callerdesk_ivr_settings TO service_role;
ALTER TABLE public.callerdesk_ivr_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administrators manage IVR drafts" ON public.callerdesk_ivr_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
COMMENT ON TABLE public.callerdesk_ivr_settings IS 'CallerDesk IVR planning drafts only. Not applied to provider: no verified configuration API available.';
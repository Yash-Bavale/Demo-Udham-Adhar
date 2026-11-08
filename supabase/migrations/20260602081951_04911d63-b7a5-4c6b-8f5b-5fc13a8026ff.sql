CREATE TABLE public.saved_lead_filters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  filter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_lead_filters TO authenticated;
GRANT ALL ON public.saved_lead_filters TO service_role;

ALTER TABLE public.saved_lead_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own saved filters"
  ON public.saved_lead_filters FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users insert own saved filters"
  ON public.saved_lead_filters FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own saved filters"
  ON public.saved_lead_filters FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own saved filters"
  ON public.saved_lead_filters FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_saved_lead_filters_user_default
  ON public.saved_lead_filters (user_id, is_default);

CREATE TRIGGER trg_saved_lead_filters_touch
  BEFORE UPDATE ON public.saved_lead_filters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
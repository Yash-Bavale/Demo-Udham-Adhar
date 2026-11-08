
-- lead_contact_events -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_contact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email','call','note','sms')),
  outcome TEXT NOT NULL CHECK (outcome IN ('connected','no_answer','wrong_number','not_interested','callback','converted_intent','sent')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_contact_events_lead_idx ON public.lead_contact_events(lead_id);
CREATE INDEX IF NOT EXISTS lead_contact_events_user_idx ON public.lead_contact_events(user_id);
CREATE INDEX IF NOT EXISTS lead_contact_events_created_idx ON public.lead_contact_events(created_at DESC);

GRANT SELECT, INSERT ON public.lead_contact_events TO authenticated;
GRANT ALL ON public.lead_contact_events TO service_role;

ALTER TABLE public.lead_contact_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff insert own contact events"
  ON public.lead_contact_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_any_staff_role(auth.uid()));

CREATE POLICY "Staff read own + admins read all"
  ON public.lead_contact_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin() OR public.is_super_admin(auth.uid()));

-- lead_attribution ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_attribution (
  lead_id UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  first_contact_user_id UUID,
  first_contact_at TIMESTAMPTZ,
  converted_user_id UUID,
  converted_at TIMESTAMPTZ,
  conversion_kind TEXT CHECK (conversion_kind IN ('system_paid','employee_handled','organic')),
  is_unique_lead BOOLEAN NOT NULL DEFAULT TRUE,
  repeat_of_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_attribution_converted_user_idx ON public.lead_attribution(converted_user_id);
CREATE INDEX IF NOT EXISTS lead_attribution_first_contact_user_idx ON public.lead_attribution(first_contact_user_id);
CREATE INDEX IF NOT EXISTS lead_attribution_converted_at_idx ON public.lead_attribution(converted_at DESC);

GRANT SELECT ON public.lead_attribution TO authenticated;
GRANT ALL ON public.lead_attribution TO service_role;

ALTER TABLE public.lead_attribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attribution readable by involved staff or admins"
  ON public.lead_attribution FOR SELECT TO authenticated
  USING (
    first_contact_user_id = auth.uid()
    OR converted_user_id = auth.uid()
    OR public.current_user_is_admin()
    OR public.is_super_admin(auth.uid())
    OR public.has_any_staff_role(auth.uid())
  );

CREATE TRIGGER lead_attribution_touch
  BEFORE UPDATE ON public.lead_attribution
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- On lead insert: mark unique / repeat and seed attribution row -------------
CREATE OR REPLACE FUNCTION public.init_lead_attribution()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_repeat UUID;
  v_email TEXT := lower(NULLIF(coalesce(NEW.email,''),''));
  v_mobile TEXT := NULLIF(regexp_replace(coalesce(NEW.mobile,''),'\D','','g'),'');
BEGIN
  IF v_email IS NOT NULL OR v_mobile IS NOT NULL THEN
    SELECT id INTO v_repeat FROM public.leads
     WHERE id <> NEW.id
       AND (
         (v_email  IS NOT NULL AND lower(email) = v_email) OR
         (v_mobile IS NOT NULL AND regexp_replace(coalesce(mobile,''),'\D','','g') = v_mobile)
       )
     ORDER BY created_at ASC
     LIMIT 1;
  END IF;

  INSERT INTO public.lead_attribution (lead_id, is_unique_lead, repeat_of_lead_id)
  VALUES (NEW.id, v_repeat IS NULL, v_repeat)
  ON CONFLICT (lead_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_init_lead_attribution ON public.leads;
CREATE TRIGGER trg_init_lead_attribution
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.init_lead_attribution();

-- On first contact event: stamp first_contact_user_id/at --------------------
CREATE OR REPLACE FUNCTION public.stamp_first_contact()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  INSERT INTO public.lead_attribution (lead_id, first_contact_user_id, first_contact_at)
  VALUES (NEW.lead_id, NEW.user_id, NEW.created_at)
  ON CONFLICT (lead_id) DO UPDATE
    SET first_contact_user_id = COALESCE(public.lead_attribution.first_contact_user_id, EXCLUDED.first_contact_user_id),
        first_contact_at      = COALESCE(public.lead_attribution.first_contact_at,      EXCLUDED.first_contact_at),
        updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_first_contact ON public.lead_contact_events;
CREATE TRIGGER trg_stamp_first_contact
  AFTER INSERT ON public.lead_contact_events
  FOR EACH ROW EXECUTE FUNCTION public.stamp_first_contact();

-- On application status hitting paid/completed: stamp conversion ------------
CREATE OR REPLACE FUNCTION public.stamp_lead_conversion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_paid_statuses TEXT[] := ARRAY['payment_received','form_submitted','under_review','under_process','completed','order_completed','consultation_completed','certificate_issued'];
  v_attr public.lead_attribution;
  v_first_user UUID;
  v_kind TEXT;
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.fulfillment_status IS NULL THEN RETURN NEW; END IF;
  IF NOT (NEW.fulfillment_status::text = ANY(v_paid_statuses)) THEN RETURN NEW; END IF;

  SELECT * INTO v_attr FROM public.lead_attribution WHERE lead_id = NEW.lead_id;
  IF v_attr.lead_id IS NULL THEN
    INSERT INTO public.lead_attribution(lead_id) VALUES (NEW.lead_id)
    ON CONFLICT (lead_id) DO NOTHING;
    SELECT * INTO v_attr FROM public.lead_attribution WHERE lead_id = NEW.lead_id;
  END IF;

  IF v_attr.converted_at IS NOT NULL THEN RETURN NEW; END IF;

  v_first_user := v_attr.first_contact_user_id;
  IF NEW.assigned_to IS NOT NULL THEN
    v_kind := 'employee_handled';
  ELSIF v_first_user IS NOT NULL THEN
    v_kind := 'employee_handled';
  ELSE
    v_kind := 'system_paid';
  END IF;

  UPDATE public.lead_attribution
     SET converted_user_id = COALESCE(NEW.assigned_to, v_first_user),
         converted_at = now(),
         conversion_kind = v_kind,
         updated_at = now()
   WHERE lead_id = NEW.lead_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_lead_conversion ON public.applications;
CREATE TRIGGER trg_stamp_lead_conversion
  AFTER INSERT OR UPDATE OF fulfillment_status, assigned_to ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.stamp_lead_conversion();

-- Seed attribution rows for existing leads ---------------------------------
INSERT INTO public.lead_attribution (lead_id)
SELECT id FROM public.leads
ON CONFLICT (lead_id) DO NOTHING;

-- Permission module entry --------------------------------------------------
INSERT INTO public.permission_modules (key, label, description, sort_order)
VALUES ('performance', 'Performance', 'Employee performance dashboard and leaderboards', 90)
ON CONFLICT (key) DO NOTHING;

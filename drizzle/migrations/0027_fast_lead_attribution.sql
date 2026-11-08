CREATE OR REPLACE FUNCTION public.init_lead_attribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_repeat UUID;
  v_email TEXT := lower(NULLIF(coalesce(NEW.email,''),''));
  v_mobile TEXT := NULLIF(regexp_replace(coalesce(NEW.mobile,''),'\D','','g'),'');
BEGIN
  IF v_email IS NOT NULL OR v_mobile IS NOT NULL THEN
    SELECT id INTO v_repeat FROM (
      SELECT id, created_at FROM public.leads
       WHERE v_mobile IS NOT NULL AND mobile = v_mobile AND id <> NEW.id
      UNION ALL
      SELECT id, created_at FROM public.leads
       WHERE v_email IS NOT NULL AND lower(email) = v_email AND id <> NEW.id
    ) m
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  INSERT INTO public.lead_attribution (lead_id, is_unique_lead, repeat_of_lead_id)
  VALUES (NEW.id, v_repeat IS NULL, v_repeat)
  ON CONFLICT (lead_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_lead_code ON public.leads;
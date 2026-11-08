
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS form_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS govt_portals_selected JSONB;

UPDATE public.applications a
SET form_submitted_at = sub.first_at
FROM (
  SELECT lead_id, MIN(created_at) AS first_at
  FROM public.onboarding_submissions
  WHERE lead_id IS NOT NULL
  GROUP BY lead_id
) sub
WHERE a.lead_id = sub.lead_id
  AND a.form_submitted_at IS NULL;

UPDATE public.applications a
SET certificate_uploaded_at = sub.first_at
FROM (
  SELECT application_id, MIN(created_at) AS first_at
  FROM public.certificates
  WHERE application_id IS NOT NULL
  GROUP BY application_id
) sub
WHERE a.id = sub.application_id
  AND a.certificate_uploaded_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_application_form_submitted_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    UPDATE public.applications
       SET form_submitted_at = COALESCE(form_submitted_at, NEW.created_at)
     WHERE lead_id = NEW.lead_id
       AND form_submitted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_form_submitted_at ON public.onboarding_submissions;
CREATE TRIGGER trg_set_form_submitted_at
AFTER INSERT ON public.onboarding_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_application_form_submitted_at();

CREATE OR REPLACE FUNCTION public.set_application_certificate_uploaded_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.application_id IS NOT NULL THEN
    UPDATE public.applications
       SET certificate_uploaded_at = COALESCE(certificate_uploaded_at, NEW.created_at)
     WHERE id = NEW.application_id
       AND certificate_uploaded_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_certificate_uploaded_at ON public.certificates;
CREATE TRIGGER trg_set_certificate_uploaded_at
AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.set_application_certificate_uploaded_at();

CREATE INDEX IF NOT EXISTS idx_applications_assigned_fulfillment
  ON public.applications (assigned_to, fulfillment_status);

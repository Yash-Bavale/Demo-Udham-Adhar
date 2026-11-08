CREATE OR REPLACE FUNCTION public.set_application_form_submitted_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only stamp form_submitted_at when the customer actually submits.
  -- Auto-saved drafts (status = 'draft') must NOT mark the application as submitted.
  IF NEW.lead_id IS NOT NULL AND NEW.status = 'submitted' THEN
    UPDATE public.applications
       SET form_submitted_at = COALESCE(form_submitted_at, COALESCE(NEW.submitted_at, now()))
     WHERE lead_id = NEW.lead_id
       AND form_submitted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- Ensure the trigger also fires on UPDATE so a draft becoming submitted later still stamps.
DROP TRIGGER IF EXISTS set_application_form_submitted_at_trg ON public.onboarding_submissions;
CREATE TRIGGER set_application_form_submitted_at_trg
AFTER INSERT OR UPDATE OF status, submitted_at ON public.onboarding_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_application_form_submitted_at();

-- Backfill: clear form_submitted_at for applications whose latest submission is still a draft.
UPDATE public.applications a
   SET form_submitted_at = NULL
  FROM public.onboarding_submissions os
 WHERE os.lead_id = a.lead_id
   AND os.status = 'draft'
   AND a.form_submitted_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.onboarding_submissions os2
      WHERE os2.lead_id = a.lead_id AND os2.status = 'submitted'
   );
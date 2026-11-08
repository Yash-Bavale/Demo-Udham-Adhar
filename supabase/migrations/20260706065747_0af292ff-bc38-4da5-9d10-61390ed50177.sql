
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS dispatch_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (dispatch_mode IN ('auto','manual'));

-- Default all non-canonical (sr_no >= 100 or null flow_id) templates to manual
UPDATE public.email_templates
   SET dispatch_mode = 'manual'
 WHERE (sr_no IS NULL OR sr_no >= 100)
   AND dispatch_mode = 'auto';

-- Per user request: welcome_and_form_link (E002) becomes manual.
UPDATE public.email_templates
   SET dispatch_mode = 'manual'
 WHERE code = 'welcome_and_form_link';

-- Remove 5 clearly unused duplicates.
DELETE FROM public.email_templates
 WHERE code IN (
   'complaint_acknowledgement',
   'lead_assigned',
   'lead_welcome',
   'post_closure_acknowledgement',
   'workflow_external_delay_notice'
 );

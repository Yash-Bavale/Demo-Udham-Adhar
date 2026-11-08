
ALTER TABLE public.workflow_delay_reasons
  ADD COLUMN IF NOT EXISTS side TEXT NOT NULL DEFAULT 'customer'
    CHECK (side IN ('customer','internal')),
  ADD COLUMN IF NOT EXISTS email_template_code TEXT;

UPDATE public.workflow_delay_reasons SET side = 'customer' WHERE code IN (
  'government_platform_assumption','change_of_mind','user_does_not_wish_to_proceed',
  'otp_not_provided','change_in_service_requirement','incorrect_information',
  'documents_missing','customer_non_responsive','eligibility_issue','service_already_started'
);

UPDATE public.workflow_delay_reasons SET side = 'internal' WHERE code IN (
  'government_portal_down','external_portal_dependency','server_downtime',
  'technical_interruption','operational_issue','technical_issue',
  'verification_pending','authority_delay','third_party_dependency'
);

-- Default customer-side delay template = E003
UPDATE public.workflow_delay_reasons
   SET email_template_code = 'bhs_e003_customer_delay'
 WHERE side = 'customer' AND email_template_code IS NULL;

UPDATE public.smtp_settings
   SET reply_to = 'help@businesshelpservices.com',
       updated_at = now()
 WHERE reply_to IS DISTINCT FROM 'help@businesshelpservices.com';

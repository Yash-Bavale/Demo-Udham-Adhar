UPDATE public.onboarding_submissions
SET form_data = form_data - 'aadhaar_mobile'
WHERE service_code IN (
  'update-udyam-certificate',
  'download-udyam-certificate',
  'migrate-udyog-aadhaar-to-udyam',
  'correct-pan-aadhaar'
)
AND form_data ? 'aadhaar_mobile';

UPDATE public.onboarding_submissions
SET form_data = form_data
  - 'section_address'
  - 'section_status'
  - 'section_bank'
  - 'section_employees'
  - 'section_documents'
WHERE form_data ?| array['section_address','section_status','section_bank','section_employees','section_documents'];
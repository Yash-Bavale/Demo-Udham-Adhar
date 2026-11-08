ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS certificate_number text;
CREATE INDEX IF NOT EXISTS applications_certificate_number_idx ON public.applications (certificate_number);
UPDATE public.applications a
SET certificate_number = c.certificate_number
FROM (
  SELECT DISTINCT ON (application_id) application_id, certificate_number
  FROM public.certificates
  WHERE certificate_number IS NOT NULL
  ORDER BY application_id, created_at DESC
) c
WHERE c.application_id = a.id AND a.certificate_number IS NULL;
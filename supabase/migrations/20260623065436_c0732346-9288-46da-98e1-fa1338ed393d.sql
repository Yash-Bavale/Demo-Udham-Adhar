UPDATE public.documents d
SET application_id = a.id
FROM (
  SELECT DISTINCT ON (lead_id) id, lead_id
  FROM public.applications
  WHERE lead_id IS NOT NULL
  ORDER BY lead_id, created_at DESC
) a
WHERE d.application_id IS NULL
  AND d.lead_id = a.lead_id;
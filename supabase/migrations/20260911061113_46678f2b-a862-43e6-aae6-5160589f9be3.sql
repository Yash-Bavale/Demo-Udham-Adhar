CREATE UNIQUE INDEX IF NOT EXISTS applications_one_active_per_lead_idx
ON public.applications (lead_id)
WHERE lead_id IS NOT NULL AND is_deleted = false;
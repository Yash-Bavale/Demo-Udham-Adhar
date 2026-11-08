-- Reset stale 'created' PayU order for UA-2026-001021 so a fresh test can be made
DELETE FROM public.payments
WHERE lead_id = (SELECT id FROM public.leads WHERE lead_code = 'UA-2026-001021')
  AND status = 'created';

-- Reminder tracking on leads for abandoned-onboarding email job
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS onboarding_reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_reminder_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_status_reminder
  ON public.leads(status, onboarding_reminded_at)
  WHERE status = 'payment_successful';
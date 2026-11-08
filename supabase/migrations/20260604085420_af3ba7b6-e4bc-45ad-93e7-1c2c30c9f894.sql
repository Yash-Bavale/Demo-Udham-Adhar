
-- Phase G: Complaints SLA columns
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS category    text,
  ADD COLUMN IF NOT EXISTS severity    text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS sla_due_at  timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS breached_at timestamptz;

-- Auto-compute sla_due_at on insert based on severity (24h critical, 48h high, 72h normal, 120h low)
CREATE OR REPLACE FUNCTION public.set_complaint_sla()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := NEW.created_at + (
      CASE COALESCE(NEW.severity,'normal')
        WHEN 'critical' THEN INTERVAL '24 hours'
        WHEN 'high'     THEN INTERVAL '48 hours'
        WHEN 'low'      THEN INTERVAL '120 hours'
        ELSE                  INTERVAL '72 hours'
      END
    );
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_set_complaint_sla ON public.complaints;
CREATE TRIGGER trg_set_complaint_sla
BEFORE INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.set_complaint_sla();

-- Seed 5 additional email templates (bringing total to 14)
INSERT INTO public.email_templates (code, name, subject, body_html, is_system, is_enabled, variables)
VALUES
  ('complaint_sla_breach', 'Complaint – SLA breach alert',
   '[Action Required] Update on grievance {{complaintNumber}}',
   '<div style="font-family:Arial,sans-serif;padding:20px"><p>Dear {{customerName}},</p><p>Your grievance <b>{{complaintNumber}}</b> has crossed the expected resolution window. Our senior operations team has been alerted and will revert within 24 hours.</p></div>',
   true, true, ARRAY['complaintNumber','customerName']),
  ('complaint_acknowledgement', 'Complaint – Acknowledgement',
   'Grievance {{complaintNumber}} received',
   '<div style="font-family:Arial,sans-serif;padding:20px"><p>Dear {{customerName}},</p><p>We have received your grievance <b>{{complaintNumber}}</b>. Our team will respond within 48 working hours.</p></div>',
   true, true, ARRAY['complaintNumber','customerName']),
  ('document_rejected', 'Document – Rejected, please re-upload',
   'Action Needed: Re-upload your {{docType}}',
   '<div style="font-family:Arial,sans-serif;padding:20px"><p>Dear {{customerName}},</p><p>Your <b>{{docType}}</b> could not be verified.<br/><b>Reason:</b> {{reason}}</p><p>Please upload a fresh copy via your application link.</p></div>',
   true, true, ARRAY['customerName','docType','reason']),
  ('payment_failed', 'Payment – Failed, please retry',
   'Payment did not go through – {{leadCode}}',
   '<div style="font-family:Arial,sans-serif;padding:20px"><p>Dear {{customerName}},</p><p>Your payment for <b>{{serviceName}}</b> was not successful. Please retry using the secure link in your dashboard.</p></div>',
   true, true, ARRAY['customerName','serviceName','leadCode']),
  ('lead_assigned', 'Lead – Internal assignment',
   'Lead {{leadCode}} assigned to you',
   '<div style="font-family:Arial,sans-serif;padding:20px"><p>Hi {{assigneeName}},</p><p>You have been assigned lead <b>{{leadCode}}</b> ({{serviceName}}). Customer: {{customerName}}.</p></div>',
   true, true, ARRAY['assigneeName','leadCode','serviceName','customerName'])
ON CONFLICT (code) DO NOTHING;

-- pg_cron: SLA scan every 6h + ensure email drain runs every 5 min
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  -- complaints SLA scan
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'complaints-sla-scan') THEN
    PERFORM cron.unschedule('complaints-sla-scan');
  END IF;
  PERFORM cron.schedule(
    'complaints-sla-scan',
    '0 */6 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://everythinghappensqindiaserver4cored.lovable.app/api/public/cron/complaints-sla',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY21nZmt5cXlzbHZic2ZrZ3R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDQ5MTcsImV4cCI6MjA5NTcyMDkxN30.bk8fWnW7vJD1hOQF81FHt-aPYTX-qfa2uQ7fN0RX84U'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );

  -- email queue drain (every 5 min). Use the existing process-emails endpoint.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-queue-drain') THEN
    PERFORM cron.unschedule('email-queue-drain');
  END IF;
  PERFORM cron.schedule(
    'email-queue-drain',
    '*/5 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://everythinghappensqindiaserver4cored.lovable.app/api/public/cron/process-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY21nZmt5cXlzbHZic2ZrZ3R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDQ5MTcsImV4cCI6MjA5NTcyMDkxN30.bk8fWnW7vJD1hOQF81FHt-aPYTX-qfa2uQ7fN0RX84U'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
END $$;

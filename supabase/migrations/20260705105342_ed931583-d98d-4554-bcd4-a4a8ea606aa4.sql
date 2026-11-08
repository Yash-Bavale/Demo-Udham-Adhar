
-- 1. Extend email_logs
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS direction         text NOT NULL DEFAULT 'outgoing',
  ADD COLUMN IF NOT EXISTS message_id        text,
  ADD COLUMN IF NOT EXISTS in_reply_to       text,
  ADD COLUMN IF NOT EXISTS references_header text,
  ADD COLUMN IF NOT EXISTS zoho_mail_uid     text,
  ADD COLUMN IF NOT EXISTS triggered_by      text,
  ADD COLUMN IF NOT EXISTS from_email        text,
  ADD COLUMN IF NOT EXISTS body_html         text,
  ADD COLUMN IF NOT EXISTS body_text         text,
  ADD COLUMN IF NOT EXISTS customer_id       uuid;

DO $$ BEGIN
  ALTER TABLE public.email_logs
    ADD CONSTRAINT email_logs_direction_check
    CHECK (direction IN ('outgoing','incoming'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_logs_message_id_uniq
  ON public.email_logs (message_id)
  WHERE message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_logs_zoho_uid_uniq
  ON public.email_logs (zoho_mail_uid)
  WHERE zoho_mail_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_logs_in_reply_to_idx    ON public.email_logs (in_reply_to)  WHERE in_reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_logs_customer_id_idx    ON public.email_logs (customer_id)  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_logs_application_id_idx ON public.email_logs (application_id);

-- 2. Seed the 5 missing BHS v2 templates (disabled by default)
INSERT INTO public.email_templates (code, name, subject, body_html, body_text, description, is_enabled, is_system)
VALUES
  ('bhs_e003_customer_delay',
   'BHS E003 – Customer Side Delay Notice',
   'We''re waiting on you — Order {{orderNumber}}',
   '<p>Hi {{customerName}},</p><p>We tried to reach you regarding your order <b>{{orderNumber}}</b> but couldn''t get the required information from your side ({{delayReason}}).</p><p>Please respond within the next business day so we can continue. If we don''t hear back, the order will be auto-closed and you can restart it any time.</p><p>— {{fromName}}</p>',
   'Hi {{customerName}}, we are waiting for your response on order {{orderNumber}} ({{delayReason}}). Please respond within the next business day.',
   'Sent when Customer-Side Delay is set; starts the 24h business-time closure timer.',
   false, true),
  ('bhs_e005_manual_reminder',
   'BHS E005 – Manual Reminder',
   'Reminder about your order {{orderNumber}}',
   '<p>Hi {{customerName}},</p><p>{{reminderMessage}}</p><p>Order: <b>{{orderNumber}}</b></p><p>— {{fromName}}</p>',
   'Hi {{customerName}}, {{reminderMessage}} (Order {{orderNumber}}).',
   'Manual reminder sent from Employee Action Panel (Our-Side Delay flow).',
   false, true),
  ('bhs_e007_feedback',
   'BHS E007 – Feedback Follow-up',
   'How did we do? — Order {{orderNumber}}',
   '<p>Hi {{customerName}},</p><p>Your order <b>{{orderNumber}}</b> is complete. We''d love your feedback — reply to this email or click {{feedbackLink}}.</p><p>Thank you!<br/>— {{fromName}}</p>',
   'Hi {{customerName}}, order {{orderNumber}} is complete. Please share your feedback: {{feedbackLink}}',
   'Post-completion feedback nudge.',
   false, true),
  ('bhs_e010_ticket_autoclose',
   'BHS E010 – Ticket Auto-Close Notice',
   'Ticket {{ticketNumber}} auto-closed',
   '<p>Hi {{customerName}},</p><p>We closed ticket <b>{{ticketNumber}}</b> as we didn''t hear back after our last reply. Reply to this email any time to reopen it.</p><p>— {{fromName}}</p>',
   'Ticket {{ticketNumber}} auto-closed after 24 business hours of no reply. Reply to reopen.',
   'Sent when a ticket auto-closes 24 business hours after the last outgoing reply.',
   false, true),
  ('bhs_e012_submitted_to_govt',
   'BHS E012 – Submitted to Government',
   'Order {{orderNumber}} submitted to the government portal',
   '<p>Hi {{customerName}},</p><p>Good news — your application for order <b>{{orderNumber}}</b> has been submitted to the government portal. We''ll notify you as soon as the certificate is issued.</p><p>— {{fromName}}</p>',
   'Good news — order {{orderNumber}} was submitted to the government portal.',
   'Sent by the "Mark Submitted to Govt" action.',
   false, true)
ON CONFLICT (code) DO NOTHING;


-- 1) Extend priority enum with 'urgent'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'priority_enum' AND e.enumlabel = 'urgent'
  ) THEN
    ALTER TYPE public.priority_enum ADD VALUE 'urgent';
  END IF;
END $$;

-- 2) Extend support_tickets
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_email TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_staff_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Backfill ticket_email from the linked customer (case-insensitive lower)
UPDATE public.support_tickets t
   SET ticket_email = lower(trim(c.primary_email))
  FROM public.customers c
 WHERE t.customer_id = c.id
   AND (t.ticket_email IS NULL OR t.ticket_email = '')
   AND c.primary_email IS NOT NULL
   AND length(trim(c.primary_email)) > 0;

-- Snapshot trigger: if ticket_email not set on insert, copy from customer
CREATE OR REPLACE FUNCTION public.snapshot_ticket_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF (NEW.ticket_email IS NULL OR NEW.ticket_email = '') AND NEW.customer_id IS NOT NULL THEN
    SELECT lower(trim(primary_email))
      INTO NEW.ticket_email
      FROM public.customers
     WHERE id = NEW.customer_id
       AND primary_email IS NOT NULL
       AND length(trim(primary_email)) > 0;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_snapshot_ticket_email ON public.support_tickets;
CREATE TRIGGER trg_snapshot_ticket_email
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_ticket_email();

-- 3) Extend ticket_replies with email threading fields
ALTER TABLE public.ticket_replies
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS email_message_id TEXT,
  ADD COLUMN IF NOT EXISTS email_in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS email_send_log_id UUID,
  ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ticket_replies_email_message_id
  ON public.ticket_replies(email_message_id)
  WHERE email_message_id IS NOT NULL;

-- 4) Email templates — enable existing ticket_created, insert/update ticket_reply + ticket_resolved
-- Subject always includes [#{{ticketNumber}}] for inbound matching.

INSERT INTO public.email_templates (code, name, subject, body_html, body_text, description, variables, is_enabled, is_system)
VALUES (
  'ticket_reply',
  'Support Ticket — Staff Reply',
  '[#{{ticketNumber}}] Re: {{ticketSubject}}',
  '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#0f172a;max-width:640px;margin:0 auto;padding:24px 16px">
     <p>Hi {{customerName}},</p>
     <p>{{replyMessage}}</p>
     <p style="margin-top:24px">To reply, simply respond to this email — your message will be added to ticket <strong>{{ticketNumber}}</strong> automatically.</p>
     <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
     <p style="color:#64748b;font-size:12px;margin:0">Ticket: {{ticketNumber}} · Subject: {{ticketSubject}}</p>
     <p style="color:#64748b;font-size:12px;margin:4px 0 0">— {{fromName}}</p>
   </div>',
  'Hi {{customerName}},

{{replyMessage}}

To reply, simply respond to this email — your message will be added to ticket {{ticketNumber}} automatically.

Ticket: {{ticketNumber}} — Subject: {{ticketSubject}}
— {{fromName}}',
  'Sent when staff post a public reply on a support ticket.',
  ARRAY['customerName','replyMessage','ticketNumber','ticketSubject','fromName']::text[],
  true,
  true
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    body_text = EXCLUDED.body_text,
    description = EXCLUDED.description,
    variables = EXCLUDED.variables,
    is_enabled = true;

INSERT INTO public.email_templates (code, name, subject, body_html, body_text, description, variables, is_enabled, is_system)
VALUES (
  'ticket_resolved',
  'Support Ticket — Resolved',
  '[#{{ticketNumber}}] Resolved: {{ticketSubject}}',
  '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#0f172a;max-width:640px;margin:0 auto;padding:24px 16px">
     <p>Hi {{customerName}},</p>
     <p>Your support ticket <strong>{{ticketNumber}}</strong> has been marked as <strong>resolved</strong>.</p>
     <p>{{resolutionNote}}</p>
     <p style="margin-top:16px">If your issue isn''t fully resolved, just reply to this email and we''ll reopen the ticket right away.</p>
     <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
     <p style="color:#64748b;font-size:12px;margin:0">Ticket: {{ticketNumber}} · Subject: {{ticketSubject}}</p>
     <p style="color:#64748b;font-size:12px;margin:4px 0 0">— {{fromName}}</p>
   </div>',
  'Hi {{customerName}},

Your support ticket {{ticketNumber}} has been marked as resolved.

{{resolutionNote}}

If your issue isn''t fully resolved, just reply to this email and we''ll reopen the ticket right away.

Ticket: {{ticketNumber}} — Subject: {{ticketSubject}}
— {{fromName}}',
  'Sent when a support ticket status is changed to resolved.',
  ARRAY['customerName','ticketNumber','ticketSubject','resolutionNote','fromName']::text[],
  true,
  true
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    body_text = EXCLUDED.body_text,
    description = EXCLUDED.description,
    variables = EXCLUDED.variables,
    is_enabled = true;

-- Enable / refresh ticket_created template with matching subject format
UPDATE public.email_templates
   SET subject = '[#{{ticketNumber}}] {{ticketSubject}}',
       body_html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#0f172a;max-width:640px;margin:0 auto;padding:24px 16px">
     <p>Hi {{customerName}},</p>
     <p>We''ve received your support request. Our team will review and respond shortly.</p>
     <table role="presentation" style="border-collapse:collapse;margin:16px 0;font-size:13px">
       <tr><td style="padding:4px 12px 4px 0;color:#64748b">Ticket Number</td><td style="padding:4px 0"><strong>{{ticketNumber}}</strong></td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#64748b">Subject</td><td style="padding:4px 0">{{ticketSubject}}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#64748b">Priority</td><td style="padding:4px 0">{{ticketPriority}}</td></tr>
     </table>
     <p style="margin-top:16px">You can reply directly to this email to add more information — your message will be attached to the ticket automatically.</p>
     <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
     <p style="color:#64748b;font-size:12px;margin:0">— {{fromName}}</p>
   </div>',
       body_text = 'Hi {{customerName}},

We''ve received your support request. Our team will review and respond shortly.

Ticket Number: {{ticketNumber}}
Subject: {{ticketSubject}}
Priority: {{ticketPriority}}

You can reply directly to this email to add more information — your message will be attached to the ticket automatically.

— {{fromName}}',
       variables = ARRAY['customerName','ticketNumber','ticketSubject','ticketPriority','fromName']::text[],
       is_enabled = true,
       disabled_reason = NULL
 WHERE code = 'ticket_created';

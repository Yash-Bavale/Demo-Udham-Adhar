
CREATE TABLE public.inbound_email_quarantine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_mail_uid TEXT UNIQUE,
  message_id TEXT,
  in_reply_to TEXT,
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  reason TEXT NOT NULL,
  matched_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  matched_ticket_email TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_email_quarantine TO authenticated;
GRANT ALL ON public.inbound_email_quarantine TO service_role;

ALTER TABLE public.inbound_email_quarantine ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view quarantine"
  ON public.inbound_email_quarantine FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

CREATE POLICY "Staff can update quarantine"
  ON public.inbound_email_quarantine FOR UPDATE
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()))
  WITH CHECK (public.has_any_staff_role(auth.uid()));

CREATE INDEX idx_inbound_quarantine_reason ON public.inbound_email_quarantine(reason, received_at DESC);
CREATE INDEX idx_inbound_quarantine_ticket ON public.inbound_email_quarantine(matched_ticket_id);

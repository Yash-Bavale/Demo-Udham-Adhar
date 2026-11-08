-- Migration: 20260924220000_email_ingestion_pipeline_v2.sql
-- Purpose: Robust, deterministic inbound email pipeline infrastructure.
-- Provides checkpoints, immutable audit logs, processing error queue, attachment tracking,
-- and schema extensions for unlinked tickets and alternate sender handling.

-- 1. Ensure email_logs has received_at column and correct index
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now();

UPDATE public.email_logs
   SET received_at = COALESCE(sent_at, created_at)
 WHERE received_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_received_at ON public.email_logs (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_zoho_uid ON public.email_logs (zoho_mail_uid) WHERE zoho_mail_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_message_id ON public.email_logs (message_id) WHERE message_id IS NOT NULL;

-- 2. Email Ingestion Checkpoints (tracks incremental sync per folder)
CREATE TABLE IF NOT EXISTS public.email_ingestion_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_address TEXT NOT NULL,
  account_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  folder_type TEXT,
  last_received_time_ms BIGINT NOT NULL DEFAULT 0,
  last_processed_uid TEXT,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  error_message TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_email_checkpoint_mailbox_folder UNIQUE (mailbox_address, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_email_checkpoints_lookup ON public.email_ingestion_checkpoints(mailbox_address, folder_id);

-- 3. Email Ingestion Audit Logs (immutable lifecycle trace for every inbound email)
CREATE TABLE IF NOT EXISTS public.email_ingestion_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_mail_uid TEXT NOT NULL,
  zoho_folder_id TEXT,
  zoho_folder_name TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  sender_raw TEXT,
  sender_normalized TEXT,
  reply_to_email TEXT,
  to_email TEXT,
  subject TEXT,
  stage TEXT NOT NULL, -- 'DISCOVERED', 'FETCHED', 'PARSED', 'NORMALIZED', 'DEDUP_SKIPPED', 'TICKET_MATCHED', 'ORDER_MATCHED', 'TICKET_CREATED', 'REPLY_APPENDED', 'ATTACHMENTS_PROCESSED', 'COMPLETED', 'PROCESSING_ERROR'
  matched_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  matched_application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  matched_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  is_duplicate BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_audit_uid ON public.email_ingestion_audit_logs(zoho_mail_uid);
CREATE INDEX IF NOT EXISTS idx_ingest_audit_message_id ON public.email_ingestion_audit_logs(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingest_audit_sender ON public.email_ingestion_audit_logs(sender_normalized);
CREATE INDEX IF NOT EXISTS idx_ingest_audit_ticket ON public.email_ingestion_audit_logs(matched_ticket_id) WHERE matched_ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingest_audit_stage_time ON public.email_ingestion_audit_logs(stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_audit_created ON public.email_ingestion_audit_logs(created_at DESC);

-- 4. Email Processing Errors (technical & parsing failures with retry capability)
CREATE TABLE IF NOT EXISTS public.email_processing_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_mail_uid TEXT NOT NULL,
  zoho_folder_id TEXT,
  zoho_folder_name TEXT,
  message_id TEXT,
  from_email TEXT,
  reply_to_email TEXT,
  subject TEXT,
  body_snippet TEXT,
  raw_headers JSONB,
  error_stage TEXT NOT NULL, -- 'FETCH', 'PARSE', 'MATCH', 'PERSIST', 'ATTACHMENT'
  error_message TEXT NOT NULL,
  error_stack TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'retrying', 'resolved', 'failed', 'dismissed'
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retried_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_action TEXT,
  matched_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proc_errors_status ON public.email_processing_errors(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proc_errors_uid ON public.email_processing_errors(zoho_mail_uid);
CREATE INDEX IF NOT EXISTS idx_proc_errors_from ON public.email_processing_errors(from_email);

-- 5. Ticket Reply Attachments (tracks inbound & outbound files saved to storage)
CREATE TABLE IF NOT EXISTS public.ticket_reply_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  ticket_reply_id UUID REFERENCES public.ticket_replies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_bucket TEXT NOT NULL DEFAULT 'documents',
  storage_path TEXT NOT NULL,
  zoho_attachment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_reply_attachments_ticket ON public.ticket_reply_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_reply_attachments_reply ON public.ticket_reply_attachments(ticket_reply_id);

-- 6. Extend support_tickets with unlinked, order_link_status, alternate_sender, and parent_ticket_id fields
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS is_unlinked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_link_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS alternate_sender_email TEXT,
  ADD COLUMN IF NOT EXISTS parent_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_order_link_status_check
    CHECK (order_link_status IN ('none', 'linked', 'needs_review', 'unlinked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_order_link_status ON public.support_tickets(order_link_status) WHERE order_link_status = 'needs_review';
CREATE INDEX IF NOT EXISTS idx_support_tickets_unlinked ON public.support_tickets(is_unlinked) WHERE is_unlinked = true;
CREATE INDEX IF NOT EXISTS idx_support_tickets_parent_ticket ON public.support_tickets(parent_ticket_id) WHERE parent_ticket_id IS NOT NULL;

-- 7. Distributed Ingestion Lock table (prevents concurrent polling overlap)
CREATE TABLE IF NOT EXISTS public.email_ingestion_locks (
  mailbox_address TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Helper function to acquire distributed polling lock
CREATE OR REPLACE FUNCTION public.acquire_email_ingestion_lock(
  p_mailbox TEXT,
  p_worker_id TEXT,
  p_ttl_seconds INT DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expires TIMESTAMPTZ := v_now + (p_ttl_seconds || ' seconds')::interval;
BEGIN
  -- Clean up expired locks first
  DELETE FROM public.email_ingestion_locks WHERE mailbox_address = p_mailbox AND expires_at < v_now;

  -- Try to insert lock
  INSERT INTO public.email_ingestion_locks (mailbox_address, locked_at, locked_by, expires_at)
  VALUES (p_mailbox, v_now, p_worker_id, v_expires)
  ON CONFLICT (mailbox_address) DO NOTHING;

  IF FOUND THEN
    RETURN true;
  END IF;

  -- Check if same worker holds active lock -> refresh TTL
  UPDATE public.email_ingestion_locks
     SET expires_at = v_expires, locked_at = v_now
   WHERE mailbox_address = p_mailbox AND locked_by = p_worker_id;

  RETURN FOUND;
END;
$$;

-- Helper function to release distributed polling lock
CREATE OR REPLACE FUNCTION public.release_email_ingestion_lock(
  p_mailbox TEXT,
  p_worker_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.email_ingestion_locks
   WHERE mailbox_address = p_mailbox AND (locked_by = p_worker_id OR expires_at < now());
END;
$$;

-- 8. Grant access and RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_ingestion_checkpoints TO authenticated, service_role;
GRANT SELECT, INSERT ON public.email_ingestion_audit_logs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_processing_errors TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_reply_attachments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_ingestion_locks TO authenticated, service_role;

ALTER TABLE public.email_ingestion_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_ingestion_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_processing_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_reply_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_ingestion_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read checkpoints" ON public.email_ingestion_checkpoints FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff read audit logs" ON public.email_ingestion_audit_logs FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff manage processing errors" ON public.email_processing_errors FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid())) WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff manage ticket attachments" ON public.ticket_reply_attachments FOR ALL TO authenticated
  USING (public.has_any_staff_role(auth.uid())) WITH CHECK (public.has_any_staff_role(auth.uid()));
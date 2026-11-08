-- Migration: Optimize Executive Dashboard Queries with Performance Indexes
-- Description: Adds targeted indexes for leads, applications, support tickets, and email log to dramatically speed up dashboard KPI and aggregation queries.

CREATE INDEX IF NOT EXISTS idx_leads_created_duplicate_status ON public.leads (created_at DESC, is_duplicate, status);
CREATE INDEX IF NOT EXISTS idx_applications_perf_dash ON public.applications (is_deleted, order_status, fulfillment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_status ON public.support_tickets (created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_created_status ON public.email_send_log (created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_workflow_reminders_status_due ON public.workflow_reminders (status, due_at);

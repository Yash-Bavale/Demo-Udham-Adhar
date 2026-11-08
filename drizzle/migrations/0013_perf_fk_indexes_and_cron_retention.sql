CREATE INDEX IF NOT EXISTS idx_documents_application_id ON public.documents (application_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_application_id ON public.support_tickets (application_id);
CREATE INDEX IF NOT EXISTS idx_invoices_application_id ON public.invoices (application_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days';
SELECT cron.schedule('prune-cron-history', '17 3 * * *', $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'$$);
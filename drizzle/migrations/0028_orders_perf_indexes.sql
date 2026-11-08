CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON public.invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_applications_active_created ON public.applications(is_deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_updated_at ON public.applications(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_action_logs_order_id ON public.order_action_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_application_id ON public.payments(application_id);
CREATE INDEX IF NOT EXISTS idx_payments_lead_id ON public.payments(lead_id);
CREATE INDEX IF NOT EXISTS idx_application_events_app_type_created ON public.application_events(application_id, event_type, created_at DESC);
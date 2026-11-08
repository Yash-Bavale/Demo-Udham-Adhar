-- Migration: Optimize Revenue & Payments Queries with Performance Indexes
-- Description: Adds composite and single-column indexes on payments and refund_requests to speed up range filters and status aggregations.

CREATE INDEX IF NOT EXISTS idx_payments_created_at_status ON public.payments (created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_status ON public.payments (gateway_name, status);
CREATE INDEX IF NOT EXISTS idx_payments_lead_id ON public.payments (lead_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_created_at_status ON public.refund_requests (created_at DESC, status);

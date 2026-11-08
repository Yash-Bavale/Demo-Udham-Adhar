-- Migration: Ensure 'processed' enum value exists and sync all processed refunds from applications/payments into refund_requests

-- 1. Ensure 'processed' is in refund_request_status enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'refund_request_status' AND e.enumlabel = 'processed'
  ) THEN
    ALTER TYPE public.refund_request_status ADD VALUE 'processed';
  END IF;
END $$;

-- 2. Link refund_requests with missing application_id via lead_id where available
UPDATE public.refund_requests rr
SET application_id = a.id,
    updated_at = now()
FROM public.applications a
WHERE rr.application_id IS NULL
  AND rr.lead_id IS NOT NULL
  AND rr.lead_id = a.lead_id;

-- 3. Sync processed_at and status = 'processed' from applications.refund_processed_at / REFUND_PROCESSED
UPDATE public.refund_requests rr
SET processed_at = COALESCE(rr.processed_at, a.refund_processed_at, a.updated_at, now()),
    status = 'processed',
    updated_at = now()
FROM public.applications a
WHERE rr.application_id = a.id
  AND (a.refund_processed_at IS NOT NULL OR a.order_status = 'REFUND_PROCESSED')
  AND (rr.processed_at IS NULL OR rr.status != 'processed');

-- 4. Sync from refunded payments
UPDATE public.refund_requests rr
SET processed_at = COALESCE(rr.processed_at, p.payment_date, p.created_at, now()),
    gateway_ref = COALESCE(rr.gateway_ref, p.transaction_id),
    status = 'processed',
    updated_at = now()
FROM public.payments p
WHERE (rr.application_id = p.application_id OR (rr.application_id IS NULL AND rr.lead_id = p.lead_id))
  AND p.status = 'refunded'
  AND (rr.processed_at IS NULL OR rr.status != 'processed');

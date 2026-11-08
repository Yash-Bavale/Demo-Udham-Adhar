-- Migration to ensure 'processed' is a valid value in public.refund_request_status
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

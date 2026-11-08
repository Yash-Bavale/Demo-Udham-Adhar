
-- 1. order_close_reasons table --------------------------------
CREATE TABLE IF NOT EXISTS public.order_close_reasons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('A','B','C')),
  number INTEGER NOT NULL,
  label TEXT NOT NULL,
  standard_reply TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, number)
);

GRANT SELECT ON public.order_close_reasons TO authenticated;
GRANT ALL ON public.order_close_reasons TO service_role;

ALTER TABLE public.order_close_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read close reasons" ON public.order_close_reasons;
CREATE POLICY "Staff can read close reasons"
  ON public.order_close_reasons FOR SELECT
  TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "Admins manage close reasons" ON public.order_close_reasons;
CREATE POLICY "Admins manage close reasons"
  ON public.order_close_reasons FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS touch_order_close_reasons ON public.order_close_reasons;
CREATE TRIGGER touch_order_close_reasons
  BEFORE UPDATE ON public.order_close_reasons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed the 14 reasons (idempotent)
INSERT INTO public.order_close_reasons (category, number, label, standard_reply, sort_order) VALUES
  ('A', 1,  'Customer requested cancellation',
    'As per your request, your order has been cancelled. If you change your mind, feel free to reach out and we will be happy to help.', 1),
  ('A', 2,  'Customer unresponsive after multiple attempts',
    'We tried reaching you multiple times without a response. Your order is being closed for now — please contact us to reopen it.', 2),
  ('A', 3,  'Customer provided incorrect information',
    'The details shared with us did not match government records. Please verify your information and place a fresh order.', 3),
  ('A', 4,  'Customer changed their mind / no longer needs service',
    'Understood — your order has been closed as per your request. We are here whenever you need us in the future.', 4),
  ('A', 5,  'Duplicate order by same customer',
    'This order appears to be a duplicate. It has been closed and the primary order continues as normal.', 5),
  ('B', 6,  'Government portal down / technical issue at portal',
    'The government portal is currently facing technical issues. We will retry automatically and update you once it is back.', 6),
  ('B', 7,  'Government rejected the application',
    'The government has rejected this application. Please review the reason shared separately and place a fresh order if you wish to reapply.', 7),
  ('B', 8,  'Government requires additional documents we cannot obtain',
    'The government has requested additional documents that need to come directly from you. Please share them and we will resume processing.', 8),
  ('B', 9,  'Regulatory / policy change affecting eligibility',
    'A recent policy change has affected eligibility for this service. Your order is being closed and any applicable refund will be processed.', 9),
  ('C', 10, 'Internal processing error',
    'We identified an internal issue on our side. Your order is being closed and a full refund is being processed. We are sorry for the inconvenience.', 10),
  ('C', 11, 'Assigned team member unavailable — escalated then closed',
    'Due to internal capacity, we are unable to process this order in a reasonable time. A full refund is being initiated.', 11),
  ('C', 12, 'Payment / refund reconciliation issue',
    'A payment reconciliation issue was identified with your order. Our accounts team will contact you to resolve it.', 12),
  ('C', 13, 'Service temporarily discontinued',
    'This service is temporarily unavailable. Your order has been closed and a full refund is being processed.', 13),
  ('C', 14, 'Other (see remarks)',
    'Your order has been closed. Please see the remarks shared separately for details.', 14)
ON CONFLICT (category, number) DO NOTHING;

-- 2. applications.active_reason_id FK -------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS active_reason_id UUID REFERENCES public.order_close_reasons(id) ON DELETE SET NULL;

-- 3. Rewrite allowed_order_transitions ------------------------
CREATE OR REPLACE FUNCTION public.allowed_order_transitions(_from public.order_status_enum)
 RETURNS public.order_status_enum[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _from
    WHEN 'NEW_ORDER'               THEN ARRAY['PAYMENT_RECEIVED','WAITING_CUSTOMER_INFO','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'PAYMENT_RECEIVED'        THEN ARRAY['ORDER_RECEIVED','FORM_PENDING','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'ORDER_RECEIVED'          THEN ARRAY['FORM_PENDING','WAITING_CUSTOMER_INFO','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'FORM_PENDING'            THEN ARRAY['FORM_RECEIVED','CUSTOMER_HOLD','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'FORM_RECEIVED'           THEN ARRAY['IN_PROCESSING','CUSTOMER_HOLD','TECHNICAL_HOLD_INTERNAL','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'WAITING_CUSTOMER_INFO'   THEN ARRAY['INFO_RECEIVED','FORM_PENDING','CUSTOMER_HOLD','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'INFO_RECEIVED'           THEN ARRAY['IN_PROCESSING','CUSTOMER_HOLD','TECHNICAL_HOLD_INTERNAL','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'IN_PROCESSING'           THEN ARRAY['SUBMITTED_TO_GOVT','CUSTOMER_HOLD','TECHNICAL_HOLD_INTERNAL','TECHNICAL_HOLD_EXTERNAL','HIGH_PRIORITY','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'CUSTOMER_HOLD'           THEN ARRAY['INFO_RECEIVED','FORM_RECEIVED','IN_PROCESSING','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'TECHNICAL_HOLD_EXTERNAL' THEN ARRAY['IN_PROCESSING','SUBMITTED_TO_GOVT','AWAITING_GOVT_APPROVAL','CLOSED']::public.order_status_enum[]
    WHEN 'TECHNICAL_HOLD_INTERNAL' THEN ARRAY['IN_PROCESSING','SUBMITTED_TO_GOVT','HIGH_PRIORITY','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'OUR_SIDE_DELAY'          THEN ARRAY['IN_PROCESSING','SUBMITTED_TO_GOVT','TECHNICAL_HOLD_INTERNAL','HIGH_PRIORITY','CLOSED']::public.order_status_enum[]
    WHEN 'SUBMITTED_TO_GOVT'       THEN ARRAY['AWAITING_GOVT_APPROVAL','CHECKING_STATUS','CERTIFICATE_ISSUED','TECHNICAL_HOLD_EXTERNAL','HIGH_PRIORITY','CLOSED']::public.order_status_enum[]
    WHEN 'AWAITING_GOVT_APPROVAL'  THEN ARRAY['CHECKING_STATUS','CERTIFICATE_ISSUED','TECHNICAL_HOLD_EXTERNAL','CLOSED']::public.order_status_enum[]
    WHEN 'CHECKING_STATUS'         THEN ARRAY['AWAITING_GOVT_APPROVAL','CERTIFICATE_ISSUED','TECHNICAL_HOLD_EXTERNAL','CLOSED']::public.order_status_enum[]
    WHEN 'CERTIFICATE_ISSUED'      THEN ARRAY['COMPLETED','CLOSED']::public.order_status_enum[]
    WHEN 'COMPLETED'               THEN ARRAY['REOPENED','CLOSED']::public.order_status_enum[]
    WHEN 'HIGH_PRIORITY'           THEN ARRAY['IN_PROCESSING','SUBMITTED_TO_GOVT','CLOSED']::public.order_status_enum[]
    WHEN 'REFUND_REQUESTED'        THEN ARRAY['REFUND_APPROVED','IN_PROCESSING','CLOSED']::public.order_status_enum[]
    WHEN 'REFUND_APPROVED'         THEN ARRAY['REFUND_PROCESSED']::public.order_status_enum[]
    WHEN 'REFUND_PROCESSED'        THEN ARRAY['CLOSED']::public.order_status_enum[]
    WHEN 'CLOSED'                  THEN ARRAY['REOPENED']::public.order_status_enum[]
    WHEN 'REOPENED'                THEN ARRAY['WAITING_CUSTOMER_INFO','FORM_PENDING','IN_PROCESSING']::public.order_status_enum[]
    ELSE ARRAY[]::public.order_status_enum[]
  END;
$function$;

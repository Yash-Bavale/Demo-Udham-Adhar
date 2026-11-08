
-- 1. Create the 15-state enum
DO $$ BEGIN
  CREATE TYPE public.order_status_enum AS ENUM (
    'NEW_ORDER',
    'WAITING_CUSTOMER_INFO',
    'INFO_RECEIVED',
    'IN_PROCESSING',
    'CUSTOMER_HOLD',
    'OUR_SIDE_DELAY',
    'SUBMITTED_TO_GOVT',
    'CERTIFICATE_ISSUED',
    'COMPLETED',
    'HIGH_PRIORITY',
    'REFUND_REQUESTED',
    'REFUND_APPROVED',
    'REFUND_PROCESSED',
    'CLOSED',
    'REOPENED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Convert applications.order_status text -> enum
ALTER TABLE public.applications
  ALTER COLUMN order_status DROP DEFAULT;

ALTER TABLE public.applications
  ALTER COLUMN order_status TYPE public.order_status_enum
  USING (
    CASE
      WHEN order_status IS NOT NULL AND order_status <> '' THEN order_status::public.order_status_enum
      WHEN fulfillment_status = 'order_received' THEN 'NEW_ORDER'::public.order_status_enum
      WHEN fulfillment_status = 'documents_received' THEN 'INFO_RECEIVED'::public.order_status_enum
      WHEN fulfillment_status = 'verification_pending' THEN 'IN_PROCESSING'::public.order_status_enum
      WHEN fulfillment_status = 'under_processing' THEN 'IN_PROCESSING'::public.order_status_enum
      WHEN fulfillment_status = 'application_submitted' THEN 'SUBMITTED_TO_GOVT'::public.order_status_enum
      WHEN fulfillment_status = 'completed' THEN 'COMPLETED'::public.order_status_enum
      WHEN fulfillment_status = 'cancelled' THEN 'CLOSED'::public.order_status_enum
      ELSE 'NEW_ORDER'::public.order_status_enum
    END
  );

ALTER TABLE public.applications
  ALTER COLUMN order_status SET DEFAULT 'NEW_ORDER'::public.order_status_enum,
  ALTER COLUMN order_status SET NOT NULL;

-- 3. Allowed transitions helper
CREATE OR REPLACE FUNCTION public.allowed_order_transitions(_from public.order_status_enum)
RETURNS public.order_status_enum[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _from
    WHEN 'NEW_ORDER'             THEN ARRAY['WAITING_CUSTOMER_INFO','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'WAITING_CUSTOMER_INFO' THEN ARRAY['INFO_RECEIVED','CUSTOMER_HOLD','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'INFO_RECEIVED'         THEN ARRAY['IN_PROCESSING','CUSTOMER_HOLD','OUR_SIDE_DELAY','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'IN_PROCESSING'         THEN ARRAY['SUBMITTED_TO_GOVT','CUSTOMER_HOLD','OUR_SIDE_DELAY','HIGH_PRIORITY','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'CUSTOMER_HOLD'         THEN ARRAY['INFO_RECEIVED','IN_PROCESSING','CLOSED','REFUND_REQUESTED']::public.order_status_enum[]
    WHEN 'OUR_SIDE_DELAY'        THEN ARRAY['IN_PROCESSING','SUBMITTED_TO_GOVT','HIGH_PRIORITY','CLOSED']::public.order_status_enum[]
    WHEN 'SUBMITTED_TO_GOVT'     THEN ARRAY['CERTIFICATE_ISSUED','OUR_SIDE_DELAY','HIGH_PRIORITY','CLOSED']::public.order_status_enum[]
    WHEN 'CERTIFICATE_ISSUED'    THEN ARRAY['COMPLETED','CLOSED']::public.order_status_enum[]
    WHEN 'COMPLETED'             THEN ARRAY['REOPENED']::public.order_status_enum[]
    WHEN 'HIGH_PRIORITY'         THEN ARRAY['IN_PROCESSING','SUBMITTED_TO_GOVT','CLOSED']::public.order_status_enum[]
    WHEN 'REFUND_REQUESTED'      THEN ARRAY['REFUND_APPROVED','IN_PROCESSING','CLOSED']::public.order_status_enum[]
    WHEN 'REFUND_APPROVED'       THEN ARRAY['REFUND_PROCESSED']::public.order_status_enum[]
    WHEN 'REFUND_PROCESSED'      THEN ARRAY['CLOSED']::public.order_status_enum[]
    WHEN 'CLOSED'                THEN ARRAY['REOPENED']::public.order_status_enum[]
    WHEN 'REOPENED'              THEN ARRAY['WAITING_CUSTOMER_INFO','IN_PROCESSING']::public.order_status_enum[]
    ELSE ARRAY[]::public.order_status_enum[]
  END;
$$;

-- 4. Transition function — enforces map + logs event
CREATE OR REPLACE FUNCTION public.transition_order_status(
  _order_id     uuid,
  _new_status   public.order_status_enum,
  _reason_id    uuid    DEFAULT NULL,
  _remarks      text    DEFAULT NULL,
  _force        boolean DEFAULT false
)
RETURNS public.applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       public.applications;
  v_old       public.order_status_enum;
  v_allowed   public.order_status_enum[];
  v_actor     uuid := auth.uid();
  v_is_super  boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'transition_order_status: not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.applications WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transition_order_status: order % not found', _order_id;
  END IF;

  v_old := v_row.order_status;

  IF v_old = _new_status THEN
    RETURN v_row;
  END IF;

  SELECT public.is_super_admin(v_actor) INTO v_is_super;

  IF NOT (_force AND v_is_super) THEN
    v_allowed := public.allowed_order_transitions(v_old);
    IF NOT (_new_status = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'transition_order_status: illegal transition % -> %', v_old, _new_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.applications
     SET order_status = _new_status,
         closure_reason_id = CASE WHEN _new_status = 'CLOSED' THEN COALESCE(_reason_id, closure_reason_id) ELSE closure_reason_id END,
         closure_remarks   = CASE WHEN _new_status = 'CLOSED' THEN COALESCE(_remarks, closure_remarks) ELSE closure_remarks END,
         refund_requested_at = CASE WHEN _new_status = 'REFUND_REQUESTED' THEN COALESCE(refund_requested_at, now()) ELSE refund_requested_at END,
         refund_reason       = CASE WHEN _new_status = 'REFUND_REQUESTED' THEN COALESCE(_remarks, refund_reason) ELSE refund_reason END,
         reopened_at         = CASE WHEN _new_status = 'REOPENED' THEN now() ELSE reopened_at END,
         reopened_by         = CASE WHEN _new_status = 'REOPENED' THEN v_actor ELSE reopened_by END,
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO v_row;

  INSERT INTO public.application_events
    (application_id, lead_id, customer_id, event_type, old_value, new_value, notes, created_by, staff_name, staff_role)
  VALUES
    (v_row.id, v_row.lead_id, v_row.customer_id, 'order_status_change',
     v_old::text, _new_status::text, _remarks, v_actor,
     COALESCE((SELECT display_name FROM public.profiles WHERE id = v_actor), 'Staff'),
     COALESCE((SELECT role::text FROM public.user_roles WHERE user_id = v_actor LIMIT 1), 'staff'));

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, public.order_status_enum, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allowed_order_transitions(public.order_status_enum) TO authenticated, anon;

ALTER TABLE public.order_schedulers
  DROP CONSTRAINT IF EXISTS order_schedulers_scheduler_type_check;

ALTER TABLE public.order_schedulers
  ADD CONSTRAINT order_schedulers_scheduler_type_check
  CHECK (
    scheduler_type = ANY (
      ARRAY[
        'customer_side_delay'::text,
        'our_side_delay'::text,
        'customer_closure_24h'::text,
        'our_side_reminder'::text,
        'ticket_autoclose_24h'::text,
        'feedback_followup'::text
      ]
    )
  );
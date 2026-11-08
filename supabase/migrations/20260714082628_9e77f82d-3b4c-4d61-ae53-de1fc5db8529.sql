
ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'ORDER_RECEIVED';
ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'FORM_PENDING';
ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'FORM_RECEIVED';
ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'TECHNICAL_HOLD_EXTERNAL';
ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'TECHNICAL_HOLD_INTERNAL';
ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'AWAITING_GOVT_APPROVAL';
ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'CHECKING_STATUS';

-- applications: hold + reason columns
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS active_reason_text TEXT,
  ADD COLUMN IF NOT EXISTS technical_hold_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS technical_hold_kind TEXT CHECK (technical_hold_kind IN ('external','internal')),
  ADD COLUMN IF NOT EXISTS customer_hold_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS awaiting_govt_started_at TIMESTAMPTZ;

-- workflow_timers: custom cadence + recurring flag
ALTER TABLE public.workflow_timers
  ADD COLUMN IF NOT EXISTS custom_interval_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS recurring BOOLEAN NOT NULL DEFAULT false;

-- support_tickets: reopen tracking
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS reopened_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_closed_at TIMESTAMPTZ;

-- Migration: 20260925180000_order_callback_history.sql
-- Purpose: Complete append-only history for scheduled and rescheduled callbacks with strict employee attribution

CREATE TABLE IF NOT EXISTS public.order_callback_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_role TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('CALLBACK_SCHEDULED', 'CALLBACK_RESCHEDULED', 'CALLBACK_CANCELLED', 'CALLBACK_COMPLETED')),
  previous_fires_at TIMESTAMPTZ,
  new_fires_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  reason_label TEXT NOT NULL,
  previous_reason TEXT,
  previous_reason_label TEXT,
  note TEXT,
  previous_note TEXT,
  channel TEXT DEFAULT 'call',
  source TEXT NOT NULL DEFAULT 'employee' CHECK (source IN ('employee', 'admin', 'system')),
  session_id TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_och_order_created ON public.order_callback_history(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_och_actor_created ON public.order_callback_history(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_och_action_type ON public.order_callback_history(action_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_och_idempotency ON public.order_callback_history(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Grants
GRANT SELECT, INSERT ON public.order_callback_history TO authenticated;
GRANT ALL ON public.order_callback_history TO service_role;

-- Row Level Security
ALTER TABLE public.order_callback_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_order_callback_history ON public.order_callback_history;
CREATE POLICY staff_read_order_callback_history ON public.order_callback_history FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_any_staff_role(auth.uid())
  );

DROP POLICY IF EXISTS staff_insert_order_callback_history ON public.order_callback_history;
CREATE POLICY staff_insert_order_callback_history ON public.order_callback_history FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));

-- Immutability rules (Append-only: No updates or deletes allowed)
CREATE OR REPLACE RULE no_update_order_callback_history AS ON UPDATE TO public.order_callback_history DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_delete_order_callback_history AS ON DELETE TO public.order_callback_history DO INSTEAD NOTHING;

-- Migration: 20260921160000_fix_sla_status_constraint.sql
-- Purpose: Fix the sla_status CHECK constraint to allow both lowercase (new code) 
--          and uppercase (legacy backfilled data from application_events).
--          Also enables realtime on order_action_logs for live dashboard subscriptions.

-- 1. Drop the old strict lowercase-only constraint
ALTER TABLE public.order_action_logs
  DROP CONSTRAINT IF EXISTS order_action_logs_sla_status_check;

-- 2. Add a new flexible constraint covering both casings + legacy COMPLIANT values
ALTER TABLE public.order_action_logs
  ADD CONSTRAINT order_action_logs_sla_status_check
  CHECK (sla_status IN ('healthy', 'at_risk', 'breached', 'compliant', 'COMPLIANT', 'AT_RISK', 'BREACHED', 'HEALTHY'));

-- 3. Normalise existing rows that used uppercase (from the backfill seeding)
UPDATE public.order_action_logs
  SET sla_status = LOWER(sla_status)
  WHERE sla_status IN ('COMPLIANT', 'AT_RISK', 'BREACHED', 'HEALTHY');

-- 4. Now tighten back to lowercase only (all rows are now lowercase)
ALTER TABLE public.order_action_logs
  DROP CONSTRAINT IF EXISTS order_action_logs_sla_status_check;

ALTER TABLE public.order_action_logs
  ADD CONSTRAINT order_action_logs_sla_status_check
  CHECK (sla_status IN ('compliant', 'at_risk', 'breached', 'healthy'));

-- 5. Enable realtime publication for the live activity feed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'order_action_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_action_logs;
  END IF;
END $$;

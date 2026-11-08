ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operations';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accounts';

ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'new_lead';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'contacted';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'refund_requested';

DO $$ BEGIN
  CREATE TYPE public.application_status AS ENUM (
    'awaiting_payment',
    'payment_received',
    'details_pending',
    'documents_pending',
    'under_review',
    'under_process',
    'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

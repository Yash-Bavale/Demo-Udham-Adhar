
-- Add new fulfillment stages for S01-S12 canonical spec
ALTER TYPE public.fulfillment_status_enum ADD VALUE IF NOT EXISTS 'awaiting_customer_form';
ALTER TYPE public.fulfillment_status_enum ADD VALUE IF NOT EXISTS 'waiting_for_customer_submission';
ALTER TYPE public.fulfillment_status_enum ADD VALUE IF NOT EXISTS 'government_processing';
ALTER TYPE public.fulfillment_status_enum ADD VALUE IF NOT EXISTS 'application_approved';
ALTER TYPE public.fulfillment_status_enum ADD VALUE IF NOT EXISTS 'application_rejected';

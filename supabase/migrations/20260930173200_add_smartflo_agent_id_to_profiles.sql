-- Add smartflo_agent_id to profiles table for Smartflo inbound telephony routing
-- Requirements:
-- - nullable text
-- - no default value
-- - existing rows remain valid with NULL
-- - no second telephony table

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS smartflo_agent_id text NULL;

COMMENT ON COLUMN public.profiles.smartflo_agent_id IS 'Smartflo agent/extension identifier for inbound telephony routing. Nullable with no default value.';

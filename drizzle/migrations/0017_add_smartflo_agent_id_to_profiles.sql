ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS smartflo_agent_id text NULL;

COMMENT ON COLUMN public.profiles.smartflo_agent_id IS 'Smartflo agent/extension identifier for inbound telephony routing. Nullable with no default value.';
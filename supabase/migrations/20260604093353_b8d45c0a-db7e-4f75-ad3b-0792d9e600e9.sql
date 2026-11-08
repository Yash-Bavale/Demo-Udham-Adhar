-- Remove PII tables from realtime publication to prevent unrestricted channel subscriptions.
-- Any authenticated user (including newly-registered staff with no role) could otherwise
-- subscribe to postgres_changes for these tables and receive customer PII.
ALTER PUBLICATION supabase_realtime DROP TABLE public.customers;
ALTER PUBLICATION supabase_realtime DROP TABLE public.customer_notes;
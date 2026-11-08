-- Enable realtime for the leads table so that postgres_changes events are
-- broadcast to subscribed clients (admin dashboard, new-lead notifications).
-- Guarded so re-runs (and environments where an earlier migration already
-- added the table) do not fail with "relation already member of publication".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.leads';
  END IF;
END $$;

-- REPLICA IDENTITY FULL ensures UPDATE payloads include old column values
-- (needed to detect assignment changes: old.assigned_to vs new.assigned_to).
ALTER TABLE public.leads REPLICA IDENTITY FULL;

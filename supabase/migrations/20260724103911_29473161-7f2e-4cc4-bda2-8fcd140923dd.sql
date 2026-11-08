DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='leads') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.leads';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='applications') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.applications';
  END IF;
END $$;

ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.applications REPLICA IDENTITY FULL;
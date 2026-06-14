DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fleet_loads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_loads';
  END IF;
END $$;
ALTER TABLE public.fleet_loads REPLICA IDENTITY FULL;
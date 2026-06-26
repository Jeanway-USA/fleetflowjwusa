DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_settlements;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_settlement_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.driver_settlements REPLICA IDENTITY FULL;
ALTER TABLE public.driver_settlement_items REPLICA IDENTITY FULL;
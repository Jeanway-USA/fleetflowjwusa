-- Enable realtime for fleet_loads so dispatchers see live status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_loads;
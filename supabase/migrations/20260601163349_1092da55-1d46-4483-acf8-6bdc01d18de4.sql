ALTER FUNCTION public.upsert_driver_banking(uuid, text, text, text, text) SET search_path = public, extensions;
ALTER FUNCTION public.get_driver_banking(uuid) SET search_path = public, extensions;
-- Drop unused/removed-feature tables: pre/post-trip inspections, fuel stop cache, HOS logs
DROP TABLE IF EXISTS public.inspection_photos CASCADE;
DROP TABLE IF EXISTS public.driver_inspections CASCADE;
DROP TABLE IF EXISTS public.fuel_stops_cache CASCADE;
DROP TABLE IF EXISTS public.hos_logs CASCADE;
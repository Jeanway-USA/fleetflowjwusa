
ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS current_route_congestion jsonb,
  ADD COLUMN IF NOT EXISTS current_route_distance_m integer,
  ADD COLUMN IF NOT EXISTS current_route_duration_s integer;

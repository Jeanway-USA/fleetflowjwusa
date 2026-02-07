
-- Create fuel_stops_cache table for caching fuel stop data
CREATE TABLE public.fuel_stops_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  chain text,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  state text NOT NULL,
  city text,
  diesel_price numeric,
  lcapp_discount numeric,
  net_price numeric,
  amenities text[],
  source text NOT NULL DEFAULT 'doe',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fuel_stops_cache ENABLE ROW LEVEL SECURITY;

-- Drivers can view fuel stops
CREATE POLICY "Drivers can view fuel stops"
ON public.fuel_stops_cache
FOR SELECT
USING (
  get_driver_id_for_user(auth.uid()) IS NOT NULL
);

-- Operations can view fuel stops
CREATE POLICY "Operations can view fuel stops"
ON public.fuel_stops_cache
FOR SELECT
USING (has_operations_access(auth.uid()));

-- Owner can manage all fuel stops
CREATE POLICY "Owner can manage fuel stops"
ON public.fuel_stops_cache
FOR ALL
USING (is_owner(auth.uid()));

-- Index for geo queries
CREATE INDEX idx_fuel_stops_cache_coords ON public.fuel_stops_cache (latitude, longitude);
CREATE INDEX idx_fuel_stops_cache_state ON public.fuel_stops_cache (state);
CREATE INDEX idx_fuel_stops_cache_fetched_at ON public.fuel_stops_cache (fetched_at);

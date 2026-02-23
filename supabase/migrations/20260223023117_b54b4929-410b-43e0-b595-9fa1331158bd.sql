
-- Create truck_stops table for caching OSM Overpass API results
CREATE TABLE public.truck_stops (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  osm_id bigint UNIQUE NOT NULL,
  name text NOT NULL,
  brand text,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  state text NOT NULL,
  city text,
  amenities text[] DEFAULT '{}',
  source text DEFAULT 'overpass',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (service role only - no user-facing policies needed)
ALTER TABLE public.truck_stops ENABLE ROW LEVEL SECURITY;

-- Index for bounding box queries
CREATE INDEX idx_truck_stops_coords ON public.truck_stops (latitude, longitude);
CREATE INDEX idx_truck_stops_osm_id ON public.truck_stops (osm_id);

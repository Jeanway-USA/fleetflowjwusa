
-- Create the official_truck_stops table
CREATE TABLE public.official_truck_stops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT NOT NULL,
  store_number TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  amenities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, store_number)
);

-- Enable RLS
ALTER TABLE public.official_truck_stops ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read official truck stops"
  ON public.official_truck_stops
  FOR SELECT
  TO authenticated
  USING (true);

-- Index for bounding box queries
CREATE INDEX idx_official_truck_stops_lat_lng
  ON public.official_truck_stops (latitude, longitude);

-- Index for brand filtering
CREATE INDEX idx_official_truck_stops_brand
  ON public.official_truck_stops (brand);

-- Trigger for updated_at
CREATE TRIGGER update_official_truck_stops_updated_at
  BEFORE UPDATE ON public.official_truck_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

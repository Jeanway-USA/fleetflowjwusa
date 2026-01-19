-- Create table for storing driver GPS locations
CREATE TABLE public.driver_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  load_id UUID REFERENCES public.fleet_loads(id) ON DELETE SET NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  heading NUMERIC,
  speed NUMERIC,
  accuracy NUMERIC,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(driver_id)
);

-- Enable RLS
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Drivers can insert/update their own location
CREATE POLICY "Drivers can upsert their own location"
ON public.driver_locations
FOR ALL
USING (driver_id = get_driver_id_for_user(auth.uid()))
WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()));

-- Admin roles can view all locations
CREATE POLICY "Admin roles can view all driver locations"
ON public.driver_locations
FOR SELECT
USING (has_admin_access(auth.uid()));

-- Create index for quick lookups
CREATE INDEX idx_driver_locations_driver_id ON public.driver_locations(driver_id);
CREATE INDEX idx_driver_locations_load_id ON public.driver_locations(load_id);

-- Enable realtime for driver_locations
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
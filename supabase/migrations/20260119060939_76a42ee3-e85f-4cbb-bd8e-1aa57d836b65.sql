-- Add pickup_time and delivery_time columns to fleet_loads table
ALTER TABLE public.fleet_loads 
ADD COLUMN pickup_time text DEFAULT NULL,
ADD COLUMN delivery_time text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.fleet_loads.pickup_time IS 'Time of pickup appointment (e.g., "08:00 AM" or "14:00")';
COMMENT ON COLUMN public.fleet_loads.delivery_time IS 'Time of delivery appointment (e.g., "10:00 AM" or "16:00")';
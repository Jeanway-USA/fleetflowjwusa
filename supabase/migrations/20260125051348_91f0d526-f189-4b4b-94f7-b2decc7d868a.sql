-- Add empty_miles column to fleet_loads table for tracking deadhead miles
ALTER TABLE public.fleet_loads ADD COLUMN IF NOT EXISTS empty_miles integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.fleet_loads.empty_miles IS 'Deadhead miles driven to pickup location (empty miles)';
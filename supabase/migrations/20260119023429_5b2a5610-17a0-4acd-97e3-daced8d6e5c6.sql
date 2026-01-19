-- Drop the existing status check constraint and add expanded statuses
ALTER TABLE public.fleet_loads DROP CONSTRAINT IF EXISTS fleet_loads_status_check;

ALTER TABLE public.fleet_loads ADD CONSTRAINT fleet_loads_status_check 
CHECK (status IN ('pending', 'assigned', 'loading', 'in_transit', 'delivered', 'cancelled'));
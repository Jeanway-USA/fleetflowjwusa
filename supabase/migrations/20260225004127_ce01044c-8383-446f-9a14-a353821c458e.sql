ALTER TABLE public.fleet_loads DROP CONSTRAINT IF EXISTS fleet_loads_status_check;

ALTER TABLE public.fleet_loads ADD CONSTRAINT fleet_loads_status_check
CHECK (status IN (
  'pending', 'assigned', 'at_pickup', 'loading',
  'in_transit', 'at_delivery', 'unloading',
  'delivered', 'cancelled'
));
ALTER TABLE public.fleet_loads
  ADD COLUMN pickup_time_type text NOT NULL DEFAULT 'appointment',
  ADD COLUMN delivery_time_type text NOT NULL DEFAULT 'appointment';
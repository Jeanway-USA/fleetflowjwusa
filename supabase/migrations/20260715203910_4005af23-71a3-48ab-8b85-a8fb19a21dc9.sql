ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS pickup_end_time text,
  ADD COLUMN IF NOT EXISTS delivery_end_time text;
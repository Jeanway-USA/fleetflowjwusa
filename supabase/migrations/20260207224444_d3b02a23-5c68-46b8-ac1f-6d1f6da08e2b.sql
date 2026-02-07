-- Add is_sharing boolean to driver_locations table
ALTER TABLE public.driver_locations
ADD COLUMN is_sharing boolean NOT NULL DEFAULT true;
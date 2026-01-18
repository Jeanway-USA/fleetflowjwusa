-- Add license_plate_state column to trucks table
ALTER TABLE public.trucks 
ADD COLUMN license_plate_state text;
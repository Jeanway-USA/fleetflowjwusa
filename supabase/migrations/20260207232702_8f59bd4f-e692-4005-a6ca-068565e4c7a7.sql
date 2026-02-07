
-- Add Landstar credentials to driver_settings (per-driver)
ALTER TABLE public.driver_settings
ADD COLUMN landstar_username text,
ADD COLUMN landstar_password text;

-- Add a comment for clarity
COMMENT ON COLUMN public.driver_settings.landstar_username IS 'Driver''s personal Landstar portal username';
COMMENT ON COLUMN public.driver_settings.landstar_password IS 'Driver''s personal Landstar portal password (encrypted at rest by Supabase)';

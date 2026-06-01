-- Drop only the sensitive plaintext password column. landstar_username is not a
-- credential and is referenced by the driver_settings_safe view, so it stays.
ALTER TABLE public.driver_settings
  DROP COLUMN IF EXISTS landstar_password;
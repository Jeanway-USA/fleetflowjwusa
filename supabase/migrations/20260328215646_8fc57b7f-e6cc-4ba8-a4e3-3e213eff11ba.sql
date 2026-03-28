-- Drop and recreate driver_settings_safe view with additional columns
DROP VIEW IF EXISTS public.driver_settings_safe;

CREATE VIEW public.driver_settings_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  driver_id,
  weekly_miles_goal,
  weekly_revenue_goal,
  pay_week_start_day,
  theme_preference,
  landstar_username,
  org_id,
  created_at,
  updated_at
FROM driver_settings;

-- Restrict access
REVOKE ALL ON public.driver_settings_safe FROM anon, public;
GRANT SELECT ON public.driver_settings_safe TO authenticated;
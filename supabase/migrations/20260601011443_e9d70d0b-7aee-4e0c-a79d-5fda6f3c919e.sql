
ALTER TABLE public.driver_settings
  ADD COLUMN IF NOT EXISTS goal_type text NOT NULL DEFAULT 'financial',
  ADD COLUMN IF NOT EXISTS target_miles integer;

CREATE OR REPLACE FUNCTION public.validate_driver_settings_goal_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.goal_type IS NOT NULL AND NEW.goal_type NOT IN ('financial', 'mileage') THEN
    RAISE EXCEPTION 'goal_type must be either financial or mileage';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_driver_settings_goal_type ON public.driver_settings;
CREATE TRIGGER trg_validate_driver_settings_goal_type
  BEFORE INSERT OR UPDATE ON public.driver_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_driver_settings_goal_type();

DROP VIEW IF EXISTS public.driver_settings_safe;

CREATE VIEW public.driver_settings_safe
WITH (security_invoker = true) AS
SELECT id,
  driver_id,
  weekly_miles_goal,
  weekly_revenue_goal,
  pay_week_start_day,
  theme_preference,
  landstar_username,
  org_id,
  goal_type,
  target_miles,
  created_at,
  updated_at
FROM public.driver_settings;

GRANT SELECT ON public.driver_settings_safe TO authenticated;

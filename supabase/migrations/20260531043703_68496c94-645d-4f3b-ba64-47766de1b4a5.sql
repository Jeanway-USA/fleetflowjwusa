CREATE TABLE public.safety_bonus_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  max_bonus_amount numeric NOT NULL DEFAULT 500.00,
  period_length_days integer NOT NULL DEFAULT 28,
  requires_zero_accidents boolean NOT NULL DEFAULT true,
  requires_zero_csa_points boolean NOT NULL DEFAULT true,
  requires_zero_service_failures boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_bonus_settings TO authenticated;
GRANT ALL ON public.safety_bonus_settings TO service_role;

ALTER TABLE public.safety_bonus_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view safety bonus settings"
  ON public.safety_bonus_settings FOR SELECT
  USING (has_admin_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their org safety bonus settings"
  ON public.safety_bonus_settings FOR SELECT
  USING (get_driver_id_for_user(auth.uid()) IS NOT NULL AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner can manage safety bonus settings"
  ON public.safety_bonus_settings FOR ALL
  USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE TRIGGER update_safety_bonus_settings_updated_at
  BEFORE UPDATE ON public.safety_bonus_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.safety_bonus_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid NOT NULL REFERENCES public.safety_bonus_settings(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  min_miles integer NOT NULL,
  max_miles integer,
  rate_per_mile numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_miles >= 0),
  CHECK (max_miles IS NULL OR max_miles > min_miles),
  CHECK (rate_per_mile >= 0)
);

CREATE INDEX idx_safety_bonus_tiers_setting ON public.safety_bonus_tiers(setting_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_bonus_tiers TO authenticated;
GRANT ALL ON public.safety_bonus_tiers TO service_role;

ALTER TABLE public.safety_bonus_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view safety bonus tiers"
  ON public.safety_bonus_tiers FOR SELECT
  USING (has_admin_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their org safety bonus tiers"
  ON public.safety_bonus_tiers FOR SELECT
  USING (get_driver_id_for_user(auth.uid()) IS NOT NULL AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner can manage safety bonus tiers"
  ON public.safety_bonus_tiers FOR ALL
  USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE TRIGGER update_safety_bonus_tiers_updated_at
  BEFORE UPDATE ON public.safety_bonus_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
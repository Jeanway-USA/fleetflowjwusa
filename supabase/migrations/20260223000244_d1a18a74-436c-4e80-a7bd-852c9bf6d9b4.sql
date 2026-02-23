
-- 1. Update is_super_admin() to include hr@jeanwayusa.com
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (auth.jwt() ->> 'email') IN ('andrew@jeanwayusa.com', 'siadrak@jeanwayusa.com', 'hr@jeanwayusa.com'),
    false
  )
$function$;

-- 2. Create subscription_plans table
CREATE TABLE public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier text NOT NULL UNIQUE,
  base_price_monthly numeric NOT NULL DEFAULT 0,
  base_price_annual numeric NOT NULL DEFAULT 0,
  features_json jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view subscription plans"
  ON public.subscription_plans FOR SELECT
  USING (true);

CREATE POLICY "Super admins can insert subscription plans"
  ON public.subscription_plans FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can update subscription plans"
  ON public.subscription_plans FOR UPDATE
  USING (is_super_admin());

CREATE POLICY "Super admins can delete subscription plans"
  ON public.subscription_plans FOR DELETE
  USING (is_super_admin());

CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with current prices
INSERT INTO public.subscription_plans (tier, base_price_monthly, base_price_annual, features_json) VALUES
  ('solo_bco', 49, 490, '["Driver Dashboard","Basic Load Management","DVIR & Inspections","Expense Tracking"]'::jsonb),
  ('fleet_owner', 149, 1490, '["Everything in Solo BCO","Fleet Management","Driver Management","Maintenance Tracking","Performance Analytics"]'::jsonb),
  ('agency', 99, 990, '["Agency Load Board","Carrier Management","Commission Tracking","CRM"]'::jsonb),
  ('all_in_one', 199, 1990, '["Everything in all plans","Executive Dashboard","Advanced Analytics","IFTA Reporting","Full CRM"]'::jsonb);

-- 3. Create promo_codes table
CREATE TABLE public.promo_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  discount_percentage integer,
  discount_amount numeric,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  max_uses integer,
  times_used integer NOT NULL DEFAULT 0,
  is_global_event boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view promo codes"
  ON public.promo_codes FOR SELECT
  USING (true);

CREATE POLICY "Super admins can insert promo codes"
  ON public.promo_codes FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can update promo codes"
  ON public.promo_codes FOR UPDATE
  USING (is_super_admin());

CREATE POLICY "Super admins can delete promo codes"
  ON public.promo_codes FOR DELETE
  USING (is_super_admin());

CREATE TRIGGER update_promo_codes_updated_at
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Add applied_promo_code_id to organizations
ALTER TABLE public.organizations
  ADD COLUMN applied_promo_code_id uuid REFERENCES public.promo_codes(id);

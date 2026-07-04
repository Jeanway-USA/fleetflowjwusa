
-- 1. state_tax_configurations table
CREATE TABLE public.state_tax_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  state_code TEXT NOT NULL CHECK (char_length(state_code) = 2),
  suta_rate NUMERIC NOT NULL DEFAULT 0,
  suta_wage_base NUMERIC NOT NULL DEFAULT 0,
  has_state_income_tax BOOLEAN NOT NULL DEFAULT false,
  sit_rate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, state_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_tax_configurations TO authenticated;
GRANT ALL ON public.state_tax_configurations TO service_role;

ALTER TABLE public.state_tax_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read state tax configs"
  ON public.state_tax_configurations FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Payroll admins manage state tax configs"
  ON public.state_tax_configurations FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role))
  )
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role))
  );

CREATE TRIGGER update_state_tax_configurations_updated_at
  BEFORE UPDATE ON public.state_tax_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. drivers.tax_state
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS tax_state TEXT;

-- 3. payroll_settings.default_tax_state
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS default_tax_state TEXT NOT NULL DEFAULT 'FL';

-- 4. driver_payroll.state_income_tax + state_code
ALTER TABLE public.driver_payroll
  ADD COLUMN IF NOT EXISTS state_income_tax NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_state TEXT;

-- 5. Seeder function
CREATE OR REPLACE FUNCTION public.seed_state_tax_configurations(_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  states TEXT[] := ARRAY[
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];
  s TEXT;
  v_rate NUMERIC;
  v_base NUMERIC;
  v_has_sit BOOLEAN;
BEGIN
  IF _org_id IS NULL THEN RETURN; END IF;
  FOREACH s IN ARRAY states LOOP
    v_rate := 0;
    v_base := 0;
    v_has_sit := false;
    IF s = 'FL' THEN
      v_rate := 0.027; v_base := 7000; v_has_sit := false;
    ELSIF s = 'TX' THEN
      v_rate := 0; v_base := 9000; v_has_sit := false;
    END IF;
    INSERT INTO public.state_tax_configurations (org_id, state_code, suta_rate, suta_wage_base, has_state_income_tax)
    VALUES (_org_id, s, v_rate, v_base, v_has_sit)
    ON CONFLICT (org_id, state_code) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_state_tax_configurations(UUID) TO authenticated;

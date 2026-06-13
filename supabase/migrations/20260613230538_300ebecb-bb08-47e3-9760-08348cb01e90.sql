
ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS is_in_bond boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cf_7512_number text;

CREATE OR REPLACE FUNCTION public.enforce_in_bond_requires_cf7512()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_in_bond = true AND (NEW.cf_7512_number IS NULL OR btrim(NEW.cf_7512_number) = '') THEN
    RAISE EXCEPTION 'CF 7512 number is required for In-Bond shipments (Rule 480)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_in_bond_requires_cf7512 ON public.fleet_loads;
CREATE TRIGGER trg_enforce_in_bond_requires_cf7512
  BEFORE INSERT OR UPDATE ON public.fleet_loads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_in_bond_requires_cf7512();

-- Driver guardrail — block is_in_bond / cf_7512_number edits
CREATE OR REPLACE FUNCTION public.enforce_driver_fleet_loads_column_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_is_assigned_driver boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.has_admin_access(auth.uid());
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  v_is_assigned_driver := (OLD.driver_id IS NOT NULL
    AND OLD.driver_id = public.get_driver_id_for_user(auth.uid()));

  IF NOT v_is_assigned_driver THEN
    RETURN NEW;
  END IF;

  IF NEW.rate IS DISTINCT FROM OLD.rate
     OR NEW.fuel_surcharge IS DISTINCT FROM OLD.fuel_surcharge
     OR NEW.gross_revenue IS DISTINCT FROM OLD.gross_revenue
     OR NEW.net_revenue IS DISTINCT FROM OLD.net_revenue
     OR NEW.truck_revenue IS DISTINCT FROM OLD.truck_revenue
     OR NEW.trailer_revenue IS DISTINCT FROM OLD.trailer_revenue
     OR NEW.settlement IS DISTINCT FROM OLD.settlement
     OR NEW.accessorials IS DISTINCT FROM OLD.accessorials
     OR NEW.lumper IS DISTINCT FROM OLD.lumper
     OR NEW.detention_pay IS DISTINCT FROM OLD.detention_pay
     OR NEW.detention_hours IS DISTINCT FROM OLD.detention_hours
     OR NEW.invoice_status IS DISTINCT FROM OLD.invoice_status
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_url IS DISTINCT FROM OLD.invoice_url
     OR NEW.factoring_status IS DISTINCT FROM OLD.factoring_status
     OR NEW.factoring_submission_id IS DISTINCT FROM OLD.factoring_submission_id
     OR NEW.advance_taken IS DISTINCT FROM OLD.advance_taken
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.truck_id IS DISTINCT FROM OLD.truck_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.destination IS DISTINCT FROM OLD.destination
     OR NEW.booked_miles IS DISTINCT FROM OLD.booked_miles
     OR NEW.pickup_date IS DISTINCT FROM OLD.pickup_date
     OR NEW.delivery_date IS DISTINCT FROM OLD.delivery_date
     OR NEW.height_inches IS DISTINCT FROM OLD.height_inches
     OR NEW.width_inches IS DISTINCT FROM OLD.width_inches
     OR NEW.length_inches IS DISTINCT FROM OLD.length_inches
     OR NEW.is_in_bond IS DISTINCT FROM OLD.is_in_bond
     OR NEW.cf_7512_number IS DISTINCT FROM OLD.cf_7512_number
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify financial or assignment fields on loads'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Seed accessorial type for existing orgs
INSERT INTO public.accessorial_types (org_id, name, default_is_driver_pay, sort_order)
SELECT o.id, 'In-Bond Fee (Rule 480)', false, 170
FROM public.organizations o
ON CONFLICT (org_id, name) DO NOTHING;

-- Seed default in_bond_fee setting for existing orgs
INSERT INTO public.company_settings (org_id, setting_key, setting_value)
SELECT o.id, 'in_bond_fee', '100'
FROM public.organizations o
ON CONFLICT (org_id, setting_key) DO NOTHING;

-- Update onboarding to include new seeds for new orgs
CREATE OR REPLACE FUNCTION public.create_onboarding_org(_name text, _tier text DEFAULT 'open_beta'::text, _tms_mode text DEFAULT 'landstar'::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org_id uuid;
  _user_id uuid := auth.uid();
  _rows_updated integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _tier NOT IN ('open_beta', 'solo_bco') THEN
    RAISE EXCEPTION 'Invalid subscription tier';
  END IF;

  IF _tms_mode NOT IN ('landstar', 'independent') THEN
    RAISE EXCEPTION 'Invalid TMS mode';
  END IF;

  INSERT INTO public.organizations (name, subscription_tier, subscription_status, tms_mode)
  VALUES (_name, _tier, 'active', _tms_mode)
  RETURNING id INTO _org_id;

  UPDATE public.profiles SET org_id = _org_id WHERE user_id = _user_id;
  GET DIAGNOSTICS _rows_updated = ROW_COUNT;
  IF _rows_updated = 0 THEN
    INSERT INTO public.profiles (user_id, email, org_id)
    VALUES (_user_id, (SELECT email FROM auth.users WHERE id = _user_id), _org_id);
  END IF;

  INSERT INTO public.user_roles (user_id, role, org_id)
  VALUES (_user_id, 'owner', _org_id)
  ON CONFLICT (user_id, role) DO UPDATE SET org_id = _org_id;

  INSERT INTO public.accessorial_types (org_id, name, default_is_driver_pay, sort_order)
  VALUES
    (_org_id, 'Detention', true, 10),
    (_org_id, 'Layover', true, 20),
    (_org_id, 'Tarping', true, 30),
    (_org_id, 'Expedited Service', true, 40),
    (_org_id, 'Tolls', false, 100),
    (_org_id, 'Permits', false, 110),
    (_org_id, 'Lumper Fees', false, 120),
    (_org_id, 'Trailer Wash Out', false, 130),
    (_org_id, 'Route Surveys', false, 140),
    (_org_id, 'Transfer of Lading', false, 150),
    (_org_id, 'Over-Dimension (Rule 670)', false, 160),
    (_org_id, 'In-Bond Fee (Rule 480)', false, 170)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO public.detention_rules (org_id, trailer_type, free_time_minutes, hourly_rate)
  VALUES
    (_org_id, 'Van',        120, 50),
    (_org_id, 'Reefer',     120, 60),
    (_org_id, 'Flatbed',    120, 50),
    (_org_id, 'Step Deck',  120, 50),
    (_org_id, 'RGN',        120, 75),
    (_org_id, 'Power Only',   0,  0)
  ON CONFLICT (org_id, trailer_type) DO NOTHING;

  INSERT INTO public.over_dimension_rules (org_id, dimension, min_inches, max_inches, cents_per_mile, sort_order)
  VALUES
    (_org_id, 'height', 163, 168, 0.10, 10),
    (_org_id, 'height', 169, 174, 0.20, 20),
    (_org_id, 'height', 175, 180, 0.40, 30),
    (_org_id, 'height', 181, NULL, 0.75, 40),
    (_org_id, 'width',  103, 120, 0.10, 10),
    (_org_id, 'width',  121, 144, 0.20, 20),
    (_org_id, 'width',  145, 168, 0.40, 30),
    (_org_id, 'width',  169, NULL, 0.75, 40),
    (_org_id, 'length', 841, 1020, 0.10, 10),
    (_org_id, 'length', 1021, 1140, 0.20, 20),
    (_org_id, 'length', 1141, 1260, 0.40, 30),
    (_org_id, 'length', 1261, NULL, 0.75, 40)
  ON CONFLICT (org_id, dimension, min_inches) DO NOTHING;

  INSERT INTO public.company_settings (org_id, setting_key, setting_value)
  VALUES (_org_id, 'in_bond_fee', '100')
  ON CONFLICT (org_id, setting_key) DO NOTHING;

  RETURN _org_id;
END;
$$;

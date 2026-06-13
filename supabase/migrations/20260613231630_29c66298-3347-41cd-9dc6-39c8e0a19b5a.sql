
-- =========================================================
-- Phase 1: Landstar LAND 100-A tariff alignment
-- =========================================================

-- 1. Schema extensions ------------------------------------------------
ALTER TABLE public.detention_rules
  ADD COLUMN IF NOT EXISTS max_charge_per_day numeric NOT NULL DEFAULT 0;

ALTER TABLE public.over_dimension_rules
  ADD COLUMN IF NOT EXISTS min_charge numeric NOT NULL DEFAULT 0;

ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS is_spotted_trailer boolean NOT NULL DEFAULT false;

-- 2. Driver guardrail update -----------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_driver_fleet_loads_column_restrictions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_is_assigned_driver boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  v_is_admin := public.has_admin_access(auth.uid());
  IF v_is_admin THEN RETURN NEW; END IF;

  v_is_assigned_driver := (OLD.driver_id IS NOT NULL
    AND OLD.driver_id = public.get_driver_id_for_user(auth.uid()));
  IF NOT v_is_assigned_driver THEN RETURN NEW; END IF;

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
     OR NEW.is_spotted_trailer IS DISTINCT FROM OLD.is_spotted_trailer
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify financial or assignment fields on loads'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Per-org reseed of Rule 500, Rule 670 Table A and new accessorials
DO $$
DECLARE
  _o uuid;
BEGIN
  FOR _o IN SELECT id FROM public.organizations LOOP

    -- Rule 500: Detention with Power (full Landstar table)
    INSERT INTO public.detention_rules
      (org_id, trailer_type, free_time_minutes, hourly_rate, max_charge_per_day) VALUES
      (_o, 'B Unit - Cargo Van',                    120,  65,  450),
      (_o, 'C Unit - Cube Van',                     120,  65,  450),
      (_o, 'D Unit - Straight Truck',               120,  65,  450),
      (_o, 'Van',                                   120,  70,  450),
      (_o, 'Reefer',                                120,  75,  900),
      (_o, 'Temperature Control',                   120,  75,  900),
      (_o, 'Flatbed',                               120,  80,  500),
      (_o, 'Flatbed - Stretch',                     120,  90,  550),
      (_o, 'Step Deck',                             120,  80,  500),
      (_o, 'Step Deck - Stretch',                   120,  90,  550),
      (_o, 'Single Drop',                           120,  80,  500),
      (_o, 'Single Drop - Stretch',                 120,  90,  550),
      (_o, 'Double Drop / RGN 5-Axle',              120, 100,  600),
      (_o, 'Double Drop / RGN 5-Axle - Stretch',    120, 115,  650),
      (_o, 'Double Drop / RGN 6-Axle',              120, 100,  700),
      (_o, 'Double Drop / RGN 6-Axle - Stretch',    120, 115,  750),
      (_o, '7-Axle',                                120, 125,  800),
      (_o, '7-Axle - Stretch',                      120, 145,  900),
      (_o, '8-Axle',                                120, 150, 1000),
      (_o, '8-Axle - Stretch',                      120, 175, 1100),
      (_o, '9-Axle',                                180, 175, 1500),
      (_o, '9-Axle - Stretch',                      180, 205, 1650),
      (_o, '12/13-Axle',                            180, 200, 2000),
      (_o, '12/13-Axle - Stretch',                  180, 240, 2200),
      (_o, 'Over 13-Axle',                          240, 225, 2250),
      (_o, 'Over 13-Axle - Stretch',                240, 275, 2500),
      (_o, 'RGN',                                   120, 100,  600),
      (_o, 'Power Only',                              0,   0,    0)
    ON CONFLICT (org_id, trailer_type) DO UPDATE SET
      free_time_minutes  = EXCLUDED.free_time_minutes,
      hourly_rate        = EXCLUDED.hourly_rate,
      max_charge_per_day = EXCLUDED.max_charge_per_day,
      updated_at         = now();

    -- Rule 670 Table A: clean rebuild (preserves only this org's seeded bands)
    DELETE FROM public.over_dimension_rules WHERE org_id = _o;

    -- WIDTH bands (CPM stored as DOLLARS per mile; min_charge in dollars)
    -- Inclusive lower edge stored as (lower_ft + 1") to keep "value >= min_inches" semantics.
    INSERT INTO public.over_dimension_rules
      (org_id, dimension, min_inches, max_inches, cents_per_mile, min_charge, sort_order) VALUES
      (_o, 'width', 103, 108, 0.40,  175, 10),
      (_o, 'width', 109, 120, 0.45,  200, 20),
      (_o, 'width', 121, 132, 0.50,  225, 30),
      (_o, 'width', 133, 144, 0.65,  250, 40),
      (_o, 'width', 145, 150, 0.80,  275, 50),
      (_o, 'width', 151, 156, 1.10,  300, 60),
      (_o, 'width', 157, 162, 1.30,  325, 70),
      (_o, 'width', 163, 168, 1.55,  375, 80),
      (_o, 'width', 169, 174, 1.80,  500, 90),
      (_o, 'width', 175, 180, 2.10,  600,100),
      (_o, 'width', 181, 186, 2.40,  700,110),
      (_o, 'width', 187, 192, 2.80,  800,120),
      (_o, 'width', 193, 198, 3.25,  900,130),
      (_o, 'width', 199, 204, 4.00, 1100,140),
      (_o, 'width', 205, 210, 5.00, 1300,150),
      (_o, 'width', 211, 216, 6.00, 1500,160),
      (_o, 'width', 217, NULL,8.00, 2000,170);

    -- HEIGHT bands
    INSERT INTO public.over_dimension_rules
      (org_id, dimension, min_inches, max_inches, cents_per_mile, min_charge, sort_order) VALUES
      (_o, 'height', 163, 168, 0.75,  250, 10),
      (_o, 'height', 169, 174, 1.00,  300, 20),
      (_o, 'height', 175, 180, 1.50,  400, 30),
      (_o, 'height', 181, 186, 2.00,  600, 40),
      (_o, 'height', 187, 192, 3.00,  800, 50),
      (_o, 'height', 193, 198, 4.00, 1100, 60),
      (_o, 'height', 199, 204, 5.00, 1500, 70),
      (_o, 'height', 205, 210, 6.00, 2000, 80),
      (_o, 'height', 211, 216, 7.00, 2500, 90),
      (_o, 'height', 217, NULL,10.00,3500,100);

    -- LENGTH bands (in inches; 70' = 840)
    INSERT INTO public.over_dimension_rules
      (org_id, dimension, min_inches, max_inches, cents_per_mile, min_charge, sort_order) VALUES
      (_o, 'length', 841,  960, 0.30,  175, 10),
      (_o, 'length', 961, 1020, 0.50,  200, 20),
      (_o, 'length',1021, 1080, 0.70,  225, 30),
      (_o, 'length',1081, 1140, 0.90,  250, 40),
      (_o, 'length',1141, 1200, 1.10,  300, 50),
      (_o, 'length',1201, 1260, 1.35,  400, 60),
      (_o, 'length',1261, 1320, 1.70,  400, 70),
      (_o, 'length',1321, 1380, 2.05,  400, 80),
      (_o, 'length',1381, 1440, 2.30,  500, 90),
      (_o, 'length',1441, 1560, 2.75,  600,100),
      (_o, 'length',1561, 1680, 3.25,  700,110),
      (_o, 'length',1681, 1800, 3.75,  800,120),
      (_o, 'length',1801, 1920, 4.25,  950,130),
      (_o, 'length',1921, 2040, 5.75, 1500,140),
      (_o, 'length',2041, 2160, 7.50, 2000,150),
      (_o, 'length',2161, 2280,10.00, 2500,160),
      (_o, 'length',2281, NULL,13.00, 3000,170);

    -- New accessorial types (Rule 501 + Rule 500-A Temp Control Layover)
    INSERT INTO public.accessorial_types (org_id, name, default_is_driver_pay, sort_order) VALUES
      (_o, 'Spotted Trailer Detention (Rule 501)', false, 175),
      (_o, 'Temp Control Layover (Rule 500-A)',   false, 178)
    ON CONFLICT (org_id, name) DO NOTHING;

  END LOOP;
END $$;

-- 4. Refresh create_onboarding_org so NEW orgs get the same seed --------
CREATE OR REPLACE FUNCTION public.create_onboarding_org(_name text, _tier text DEFAULT 'open_beta'::text, _tms_mode text DEFAULT 'landstar'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _org_id uuid;
  _user_id uuid := auth.uid();
  _rows_updated integer;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _tier NOT IN ('open_beta', 'solo_bco') THEN RAISE EXCEPTION 'Invalid subscription tier'; END IF;
  IF _tms_mode NOT IN ('landstar', 'independent') THEN RAISE EXCEPTION 'Invalid TMS mode'; END IF;

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

  -- Accessorial catalog (Landstar tariff-aligned)
  INSERT INTO public.accessorial_types (org_id, name, default_is_driver_pay, sort_order) VALUES
    (_org_id, 'Detention',                              true,  10),
    (_org_id, 'Layover',                                true,  20),
    (_org_id, 'Tarping',                                true,  30),
    (_org_id, 'Expedited Service',                      true,  40),
    (_org_id, 'Tolls',                                  false,100),
    (_org_id, 'Permits',                                false,110),
    (_org_id, 'Lumper Fees',                            false,120),
    (_org_id, 'Trailer Wash Out',                       false,130),
    (_org_id, 'Route Surveys',                          false,140),
    (_org_id, 'Transfer of Lading',                     false,150),
    (_org_id, 'Over-Dimension (Rule 670)',              false,160),
    (_org_id, 'In-Bond Fee (Rule 480)',                 false,170),
    (_org_id, 'Spotted Trailer Detention (Rule 501)',   false,175),
    (_org_id, 'Temp Control Layover (Rule 500-A)',      false,178)
  ON CONFLICT (org_id, name) DO NOTHING;

  -- Rule 500 detention (full Landstar table)
  INSERT INTO public.detention_rules
    (org_id, trailer_type, free_time_minutes, hourly_rate, max_charge_per_day) VALUES
    (_org_id, 'B Unit - Cargo Van',                    120,  65,  450),
    (_org_id, 'C Unit - Cube Van',                     120,  65,  450),
    (_org_id, 'D Unit - Straight Truck',               120,  65,  450),
    (_org_id, 'Van',                                   120,  70,  450),
    (_org_id, 'Reefer',                                120,  75,  900),
    (_org_id, 'Temperature Control',                   120,  75,  900),
    (_org_id, 'Flatbed',                               120,  80,  500),
    (_org_id, 'Flatbed - Stretch',                     120,  90,  550),
    (_org_id, 'Step Deck',                             120,  80,  500),
    (_org_id, 'Step Deck - Stretch',                   120,  90,  550),
    (_org_id, 'Single Drop',                           120,  80,  500),
    (_org_id, 'Single Drop - Stretch',                 120,  90,  550),
    (_org_id, 'Double Drop / RGN 5-Axle',              120, 100,  600),
    (_org_id, 'Double Drop / RGN 5-Axle - Stretch',    120, 115,  650),
    (_org_id, 'Double Drop / RGN 6-Axle',              120, 100,  700),
    (_org_id, 'Double Drop / RGN 6-Axle - Stretch',    120, 115,  750),
    (_org_id, '7-Axle',                                120, 125,  800),
    (_org_id, '7-Axle - Stretch',                      120, 145,  900),
    (_org_id, '8-Axle',                                120, 150, 1000),
    (_org_id, '8-Axle - Stretch',                      120, 175, 1100),
    (_org_id, '9-Axle',                                180, 175, 1500),
    (_org_id, '9-Axle - Stretch',                      180, 205, 1650),
    (_org_id, '12/13-Axle',                            180, 200, 2000),
    (_org_id, '12/13-Axle - Stretch',                  180, 240, 2200),
    (_org_id, 'Over 13-Axle',                          240, 225, 2250),
    (_org_id, 'Over 13-Axle - Stretch',                240, 275, 2500),
    (_org_id, 'RGN',                                   120, 100,  600),
    (_org_id, 'Power Only',                              0,   0,    0)
  ON CONFLICT (org_id, trailer_type) DO NOTHING;

  -- Rule 670 Table A: WIDTH/HEIGHT/LENGTH bands
  INSERT INTO public.over_dimension_rules
    (org_id, dimension, min_inches, max_inches, cents_per_mile, min_charge, sort_order) VALUES
    (_org_id, 'width', 103, 108, 0.40,  175, 10),
    (_org_id, 'width', 109, 120, 0.45,  200, 20),
    (_org_id, 'width', 121, 132, 0.50,  225, 30),
    (_org_id, 'width', 133, 144, 0.65,  250, 40),
    (_org_id, 'width', 145, 150, 0.80,  275, 50),
    (_org_id, 'width', 151, 156, 1.10,  300, 60),
    (_org_id, 'width', 157, 162, 1.30,  325, 70),
    (_org_id, 'width', 163, 168, 1.55,  375, 80),
    (_org_id, 'width', 169, 174, 1.80,  500, 90),
    (_org_id, 'width', 175, 180, 2.10,  600,100),
    (_org_id, 'width', 181, 186, 2.40,  700,110),
    (_org_id, 'width', 187, 192, 2.80,  800,120),
    (_org_id, 'width', 193, 198, 3.25,  900,130),
    (_org_id, 'width', 199, 204, 4.00, 1100,140),
    (_org_id, 'width', 205, 210, 5.00, 1300,150),
    (_org_id, 'width', 211, 216, 6.00, 1500,160),
    (_org_id, 'width', 217, NULL,8.00, 2000,170),
    (_org_id, 'height',163, 168, 0.75,  250, 10),
    (_org_id, 'height',169, 174, 1.00,  300, 20),
    (_org_id, 'height',175, 180, 1.50,  400, 30),
    (_org_id, 'height',181, 186, 2.00,  600, 40),
    (_org_id, 'height',187, 192, 3.00,  800, 50),
    (_org_id, 'height',193, 198, 4.00, 1100, 60),
    (_org_id, 'height',199, 204, 5.00, 1500, 70),
    (_org_id, 'height',205, 210, 6.00, 2000, 80),
    (_org_id, 'height',211, 216, 7.00, 2500, 90),
    (_org_id, 'height',217, NULL,10.00,3500,100),
    (_org_id, 'length',841, 960, 0.30,  175, 10),
    (_org_id, 'length',961,1020, 0.50,  200, 20),
    (_org_id, 'length',1021,1080,0.70,  225, 30),
    (_org_id, 'length',1081,1140,0.90,  250, 40),
    (_org_id, 'length',1141,1200,1.10,  300, 50),
    (_org_id, 'length',1201,1260,1.35,  400, 60),
    (_org_id, 'length',1261,1320,1.70,  400, 70),
    (_org_id, 'length',1321,1380,2.05,  400, 80),
    (_org_id, 'length',1381,1440,2.30,  500, 90),
    (_org_id, 'length',1441,1560,2.75,  600,100),
    (_org_id, 'length',1561,1680,3.25,  700,110),
    (_org_id, 'length',1681,1800,3.75,  800,120),
    (_org_id, 'length',1801,1920,4.25,  950,130),
    (_org_id, 'length',1921,2040,5.75, 1500,140),
    (_org_id, 'length',2041,2160,7.50, 2000,150),
    (_org_id, 'length',2161,2280,10.00,2500,160),
    (_org_id, 'length',2281,NULL,13.00,3000,170)
  ON CONFLICT (org_id, dimension, min_inches) DO NOTHING;

  -- Rule 480 default fee
  INSERT INTO public.company_settings (org_id, setting_key, setting_value)
  VALUES (_org_id, 'in_bond_fee', '100')
  ON CONFLICT (org_id, setting_key) DO NOTHING;

  RETURN _org_id;
END;
$function$;


-- Detention rules per trailer type
CREATE TABLE public.detention_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trailer_type text NOT NULL,
  free_time_minutes integer NOT NULL DEFAULT 120,
  hourly_rate numeric NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, trailer_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.detention_rules TO authenticated;
GRANT ALL ON public.detention_rules TO service_role;

ALTER TABLE public.detention_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same org can read detention rules"
  ON public.detention_rules FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can insert detention rules"
  ON public.detention_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND public.has_admin_access(auth.uid())
  );

CREATE POLICY "Admins can update detention rules"
  ON public.detention_rules FOR UPDATE
  TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND public.has_admin_access(auth.uid())
  )
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND public.has_admin_access(auth.uid())
  );

CREATE POLICY "Admins can delete detention rules"
  ON public.detention_rules FOR DELETE
  TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND public.has_admin_access(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_detention_rules_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_detention_rules_org_id_trg
  BEFORE INSERT ON public.detention_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_detention_rules_org_id();

CREATE TRIGGER update_detention_rules_updated_at
  BEFORE UPDATE ON public.detention_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults for existing organizations
INSERT INTO public.detention_rules (org_id, trailer_type, free_time_minutes, hourly_rate)
SELECT o.id, v.trailer_type, v.free_time_minutes, v.hourly_rate
FROM public.organizations o
CROSS JOIN (VALUES
  ('Van',          120, 50),
  ('Reefer',       120, 60),
  ('Flatbed',      120, 50),
  ('Step Deck',    120, 50),
  ('RGN',          120, 75),
  ('Power Only',     0,  0)
) AS v(trailer_type, free_time_minutes, hourly_rate)
ON CONFLICT (org_id, trailer_type) DO NOTHING;

-- Seed inside onboarding for future orgs
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

  UPDATE public.profiles
  SET org_id = _org_id
  WHERE user_id = _user_id;

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
    (_org_id, 'Transfer of Lading', false, 150)
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

  RETURN _org_id;
END;
$function$;

-- Add detention_hours column to fleet_loads
ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS detention_hours numeric;

-- Allow drivers to update detention_hours via existing trigger
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
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify financial or assignment fields on loads'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

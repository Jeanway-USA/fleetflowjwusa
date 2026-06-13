
CREATE TABLE public.accessorial_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_is_driver_pay boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accessorial_types TO authenticated;
GRANT ALL ON public.accessorial_types TO service_role;

ALTER TABLE public.accessorial_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same-org users can view accessorial types"
  ON public.accessorial_types FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can insert accessorial types"
  ON public.accessorial_types FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_admin_access(auth.uid()));

CREATE POLICY "Admins can update accessorial types"
  ON public.accessorial_types FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_admin_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_admin_access(auth.uid()));

CREATE POLICY "Admins can delete accessorial types"
  ON public.accessorial_types FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_admin_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_accessorial_types_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_accessorial_types_org_id_trg
  BEFORE INSERT ON public.accessorial_types
  FOR EACH ROW EXECUTE FUNCTION public.set_accessorial_types_org_id();

CREATE TRIGGER update_accessorial_types_updated_at
  BEFORE UPDATE ON public.accessorial_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults for all existing orgs
INSERT INTO public.accessorial_types (org_id, name, default_is_driver_pay, sort_order)
SELECT o.id, t.name, t.dp, t.so
FROM public.organizations o
CROSS JOIN (VALUES
  ('Detention', true, 10),
  ('Layover', true, 20),
  ('Tarping', true, 30),
  ('Expedited Service', true, 40),
  ('Tolls', false, 100),
  ('Permits', false, 110),
  ('Lumper Fees', false, 120),
  ('Trailer Wash Out', false, 130),
  ('Route Surveys', false, 140),
  ('Transfer of Lading', false, 150)
) AS t(name, dp, so)
ON CONFLICT (org_id, name) DO NOTHING;

-- Update onboarding to seed new orgs
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

  -- Seed default accessorial types
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

  RETURN _org_id;
END;
$function$;

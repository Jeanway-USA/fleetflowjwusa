-- Hire plans and area limits.
--
-- ADDITIVE ONLY. Nothing existing is changed, except that restrictive read policies are added to four tables.
-- Those policies let everyone through unless that person has been given an explicit area limit, so nobody who
-- has access today loses it. Owners are never limited. Nothing here can be deleted by the app.
--
-- 1. hire_plans: when someone is invited with a position and pay package chosen, the choice is saved here and
--    applied automatically the moment they accept the invitation (a trigger on invitations).
-- 2. user_area_access: an optional limit that narrows a person to the areas of their position. A limit can only
--    take access away from what their role already allows. To give someone more, change their role.

CREATE TABLE IF NOT EXISTS public.hire_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  email            text NOT NULL,
  position_id      uuid REFERENCES public.positions (id) ON DELETE RESTRICT,
  pay_package_id   uuid REFERENCES public.pay_packages (id) ON DELETE RESTRICT,
  effective_start  date NOT NULL DEFAULT CURRENT_DATE,
  limit_to_areas   boolean NOT NULL DEFAULT false,
  areas            jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_at       timestamptz,
  apply_note       text,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hire_plans_lookup_idx ON public.hire_plans (org_id, lower(email)) WHERE applied_at IS NULL;

CREATE TABLE IF NOT EXISTS public.user_area_access (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  user_id      uuid NOT NULL,
  areas        jsonb NOT NULL DEFAULT '[]'::jsonb,
  position_id  uuid REFERENCES public.positions (id) ON DELETE RESTRICT,
  is_active    boolean NOT NULL DEFAULT true,
  changed_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

DROP TRIGGER IF EXISTS trg_user_area_access_updated_at ON public.user_area_access;
CREATE TRIGGER trg_user_area_access_updated_at BEFORE UPDATE ON public.user_area_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- True unless this person has an active area limit that leaves the area out. Owners are never limited.
CREATE OR REPLACE FUNCTION public.has_area(_uid uuid, _area text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN true
    WHEN public.is_owner(_uid) THEN true
    ELSE NOT EXISTS (
      SELECT 1 FROM public.user_area_access u
      WHERE u.user_id = _uid AND u.is_active AND NOT (u.areas ? _area)
    )
  END;
$$;

ALTER TABLE public.hire_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_area_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hire_plans_select" ON public.hire_plans;
CREATE POLICY "hire_plans_select" ON public.hire_plans FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));
DROP POLICY IF EXISTS "hire_plans_insert" ON public.hire_plans;
CREATE POLICY "hire_plans_insert" ON public.hire_plans FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));
DROP POLICY IF EXISTS "hire_plans_update" ON public.hire_plans;
CREATE POLICY "hire_plans_update" ON public.hire_plans FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));

-- Everyone can see their own limit (so the app can hide what they cannot use); managers can see all.
DROP POLICY IF EXISTS "user_area_access_select" ON public.user_area_access;
CREATE POLICY "user_area_access_select" ON public.user_area_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid())));

-- Limits are written only through set_user_area_access below.

-- Set, change or lift a person's area limit. Lifting keeps the row (is_active = false) as history.
CREATE OR REPLACE FUNCTION public.set_user_area_access(_user_id uuid, _areas jsonb, _active boolean, _position_id uuid DEFAULT NULL)
RETURNS public.user_area_access
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _row public.user_area_access;
BEGIN
  IF NOT public.can_manage_pay_packages(auth.uid()) THEN
    RAISE EXCEPTION 'Only owners and payroll admins can limit access';
  END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Choose a person'; END IF;
  IF public.is_owner(_user_id) THEN RAISE EXCEPTION 'Owners cannot be limited'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _user_id AND p.org_id = _org) THEN
    RAISE EXCEPTION 'That person is not in your organization';
  END IF;
  INSERT INTO public.user_area_access (org_id, user_id, areas, position_id, is_active, changed_by)
  VALUES (_org, _user_id, COALESCE(_areas, '[]'::jsonb), _position_id, COALESCE(_active, true), auth.uid())
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET areas = EXCLUDED.areas, position_id = EXCLUDED.position_id, is_active = EXCLUDED.is_active, changed_by = auth.uid()
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

-- Restrictive read policies: a person with an area limit cannot read that area's tables. People without a limit
-- are unaffected, because has_area() is true for them.
DROP POLICY IF EXISTS "area_limit_payroll" ON public.driver_settlements;
CREATE POLICY "area_limit_payroll" ON public.driver_settlements AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_area(auth.uid(), 'payroll'));
DROP POLICY IF EXISTS "area_limit_payroll" ON public.driver_settlement_items;
CREATE POLICY "area_limit_payroll" ON public.driver_settlement_items AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_area(auth.uid(), 'payroll'));
DROP POLICY IF EXISTS "area_limit_finance" ON public.expenses;
CREATE POLICY "area_limit_finance" ON public.expenses AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_area(auth.uid(), 'finance'));
DROP POLICY IF EXISTS "area_limit_loads" ON public.fleet_loads;
CREATE POLICY "area_limit_loads" ON public.fleet_loads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_area(auth.uid(), 'loads'));

-- When an invitation is accepted, apply the hire plan saved for that email: position, pay package and limit.
-- This must never stop someone from joining, so any problem becomes a note on the plan instead of an error.
CREATE OR REPLACE FUNCTION public.apply_hire_plan_on_accept()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  plan public.hire_plans;
BEGIN
  IF NEW.status IS DISTINCT FROM 'accepted' OR OLD.status IS NOT DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO plan FROM public.hire_plans
   WHERE org_id = NEW.org_id AND lower(email) = lower(NEW.email) AND applied_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF plan.id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    IF plan.position_id IS NOT NULL THEN
      INSERT INTO public.position_assignments (org_id, position_id, driver_id, user_id, effective_start, note, created_by)
      VALUES (NEW.org_id, plan.position_id, NEW.driver_id, NEW.invited_user_id, plan.effective_start, 'Set when the invitation was accepted', plan.created_by);
    END IF;

    IF plan.pay_package_id IS NOT NULL THEN
      INSERT INTO public.driver_pay_package_assignments (org_id, package_id, driver_id, user_id, effective_start, note, created_by)
      VALUES (NEW.org_id, plan.pay_package_id, NEW.driver_id, NEW.invited_user_id, plan.effective_start, 'Set when the invitation was accepted', plan.created_by);
    END IF;

    IF plan.limit_to_areas AND NEW.invited_user_id IS NOT NULL AND NOT public.is_owner(NEW.invited_user_id) THEN
      INSERT INTO public.user_area_access (org_id, user_id, areas, position_id, is_active, changed_by)
      VALUES (NEW.org_id, NEW.invited_user_id, plan.areas, plan.position_id, true, plan.created_by)
      ON CONFLICT (org_id, user_id) DO UPDATE SET areas = EXCLUDED.areas, position_id = EXCLUDED.position_id, is_active = true;
    END IF;

    UPDATE public.hire_plans SET applied_at = now() WHERE id = plan.id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.hire_plans SET apply_note = left(SQLERRM, 300) WHERE id = plan.id;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_hire_plan ON public.invitations;
CREATE TRIGGER trg_apply_hire_plan AFTER UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.apply_hire_plan_on_accept();

GRANT SELECT, INSERT, UPDATE ON public.hire_plans TO authenticated;
GRANT SELECT ON public.user_area_access TO authenticated;
GRANT ALL ON public.hire_plans, public.user_area_access TO service_role;
GRANT EXECUTE ON FUNCTION public.has_area(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_area_access(uuid, jsonb, boolean, uuid) TO authenticated;

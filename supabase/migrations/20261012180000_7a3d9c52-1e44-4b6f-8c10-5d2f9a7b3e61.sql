-- Pay packages: configurable compensation.
--
-- Everything here is ADDITIVE. No existing table, column, row, function or policy is changed or removed, so every
-- settlement and every Landstar reconciliation record stays exactly as it is. Nothing in these tables can be
-- deleted by the app: there is no DELETE policy and the DELETE privilege is not granted. Packages and components
-- are archived (or marked removed) instead, and every save keeps a full version snapshot.
--
-- Who can do what:
--   owners and payroll_admin  create, edit, duplicate, archive, assign, override
--   everyone else             read ONLY the package assigned to them (as a driver or as a staff user)

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pay_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  name            text NOT NULL,
  description     text,
  position_type   text NOT NULL DEFAULT 'driver' CHECK (position_type IN ('driver', 'dispatcher', 'office', 'other')),
  is_active       boolean NOT NULL DEFAULT true,
  effective_start date,
  effective_end   date,
  archived_at     timestamptz,
  archived_by     uuid,
  version_number  integer NOT NULL DEFAULT 0,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_end IS NULL OR effective_start IS NULL OR effective_end >= effective_start)
);
CREATE INDEX IF NOT EXISTS pay_packages_org_idx ON public.pay_packages (org_id);

CREATE TABLE IF NOT EXISTS public.pay_package_components (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL,
  package_id         uuid NOT NULL REFERENCES public.pay_packages (id) ON DELETE RESTRICT,
  component_type     text NOT NULL CHECK (component_type IN (
                       'base_pay', 'safety_bonus', 'performance_bonus', 'mileage_bonus', 'detention',
                       'accessorial_share', 'benefit', 'deduction', 'advance_recovery', 'escrow_contribution', 'custom')),
  label              text NOT NULL,
  calculation_method text NOT NULL CHECK (calculation_method IN (
                       'flat_weekly', 'flat_daily', 'per_mile', 'percentage_of_net_revenue',
                       'percentage_of_gross', 'fixed_amount', 'formula')),
  value              numeric NOT NULL DEFAULT 0,
  unit               text NOT NULL DEFAULT 'usd',
  formula            text,
  is_taxable         boolean NOT NULL DEFAULT true,
  is_deduction       boolean NOT NULL DEFAULT false,
  sort_order         integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  removed_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pay_package_components_package_idx ON public.pay_package_components (package_id, sort_order);

-- A full copy of the package after every save: what it looked like on any past date.
CREATE TABLE IF NOT EXISTS public.pay_package_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  package_id     uuid NOT NULL REFERENCES public.pay_packages (id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  snapshot       jsonb NOT NULL,
  change_note    text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, version_number)
);

-- Who is paid under which package, from when. An assignment is ended by giving it an end date, never deleted.
CREATE TABLE IF NOT EXISTS public.driver_pay_package_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  package_id      uuid NOT NULL REFERENCES public.pay_packages (id) ON DELETE RESTRICT,
  driver_id       uuid REFERENCES public.drivers (id) ON DELETE RESTRICT,
  user_id         uuid,
  effective_start date NOT NULL,
  effective_end   date,
  note            text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (driver_id IS NOT NULL OR user_id IS NOT NULL),
  CHECK (effective_end IS NULL OR effective_end >= effective_start)
);
CREATE INDEX IF NOT EXISTS pay_assignments_driver_idx ON public.driver_pay_package_assignments (driver_id, effective_start DESC);
CREATE INDEX IF NOT EXISTS pay_assignments_user_idx ON public.driver_pay_package_assignments (user_id);

-- A change that applies to ONE settlement period only: different values, switched-off components, one-off lines.
CREATE TABLE IF NOT EXISTS public.pay_package_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL,
  driver_id           uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  package_id          uuid REFERENCES public.pay_packages (id) ON DELETE RESTRICT,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  component_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra_lines         jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason              text,
  voided_at           timestamptz,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS pay_overrides_driver_idx ON public.pay_package_overrides (driver_id, period_end DESC);

-- What a settlement was paid under, frozen. settlement_id is deliberately NOT a foreign key: the existing
-- settlement functions delete and recreate draft settlements, and this table must never get in their way.
CREATE TABLE IF NOT EXISTS public.settlement_pay_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  settlement_id  uuid NOT NULL,
  driver_id      uuid,
  package_id     uuid,
  version_id     uuid,
  version_number integer,
  assignment_id  uuid,
  override_id    uuid,
  package_name   text,
  snapshot       jsonb NOT NULL,
  lines          jsonb NOT NULL,
  totals         jsonb NOT NULL,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS settlement_pay_snapshots_settlement_uidx ON public.settlement_pay_snapshots (settlement_id);
CREATE INDEX IF NOT EXISTS settlement_pay_snapshots_driver_idx ON public.settlement_pay_snapshots (driver_id);

DROP TRIGGER IF EXISTS trg_pay_packages_updated_at ON public.pay_packages;
CREATE TRIGGER trg_pay_packages_updated_at BEFORE UPDATE ON public.pay_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_pay_package_components_updated_at ON public.pay_package_components;
CREATE TRIGGER trg_pay_package_components_updated_at BEFORE UPDATE ON public.pay_package_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Who may do what
-- ---------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_pay_packages(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL AND (public.is_owner(_uid) OR public.has_role(_uid, 'payroll_admin'::app_role));
$$;

-- True when the person may read this package: they manage packages, or it is the package assigned to them
-- (as the driver on an assignment, or as a staff user named on it).
CREATE OR REPLACE FUNCTION public.can_view_pay_package(_package_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pay_packages p
    WHERE p.id = _package_id
      AND p.org_id = public.get_user_org_id(auth.uid())
      AND (
        public.can_manage_pay_packages(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.driver_pay_package_assignments a
          LEFT JOIN public.drivers d ON d.id = a.driver_id
          WHERE a.package_id = p.id
            AND (a.user_id = auth.uid() OR d.user_id = auth.uid())
        )
      )
  );
$$;

ALTER TABLE public.pay_packages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_package_components        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_package_versions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_pay_package_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_package_overrides         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_pay_snapshots      ENABLE ROW LEVEL SECURITY;

-- Packages, components, versions: read what you are allowed to see; only managers write.
DROP POLICY IF EXISTS "pay_packages_select" ON public.pay_packages;
CREATE POLICY "pay_packages_select" ON public.pay_packages FOR SELECT TO authenticated
  USING (public.can_view_pay_package(id));
DROP POLICY IF EXISTS "pay_packages_insert" ON public.pay_packages;
CREATE POLICY "pay_packages_insert" ON public.pay_packages FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));
DROP POLICY IF EXISTS "pay_packages_update" ON public.pay_packages;
CREATE POLICY "pay_packages_update" ON public.pay_packages FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));

DROP POLICY IF EXISTS "pay_components_select" ON public.pay_package_components;
CREATE POLICY "pay_components_select" ON public.pay_package_components FOR SELECT TO authenticated
  USING (public.can_view_pay_package(package_id));
DROP POLICY IF EXISTS "pay_components_insert" ON public.pay_package_components;
CREATE POLICY "pay_components_insert" ON public.pay_package_components FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));
DROP POLICY IF EXISTS "pay_components_update" ON public.pay_package_components;
CREATE POLICY "pay_components_update" ON public.pay_package_components FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));

DROP POLICY IF EXISTS "pay_versions_select" ON public.pay_package_versions;
CREATE POLICY "pay_versions_select" ON public.pay_package_versions FOR SELECT TO authenticated
  USING (public.can_view_pay_package(package_id));
DROP POLICY IF EXISTS "pay_versions_insert" ON public.pay_package_versions;
CREATE POLICY "pay_versions_insert" ON public.pay_package_versions FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));

-- Assignments and overrides: managers see all; a person sees only their own.
DROP POLICY IF EXISTS "pay_assignments_select" ON public.driver_pay_package_assignments;
CREATE POLICY "pay_assignments_select" ON public.driver_pay_package_assignments FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.can_manage_pay_packages(auth.uid())
      OR user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "pay_assignments_insert" ON public.driver_pay_package_assignments;
CREATE POLICY "pay_assignments_insert" ON public.driver_pay_package_assignments FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));
DROP POLICY IF EXISTS "pay_assignments_update" ON public.driver_pay_package_assignments;
CREATE POLICY "pay_assignments_update" ON public.driver_pay_package_assignments FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));

DROP POLICY IF EXISTS "pay_overrides_select" ON public.pay_package_overrides;
CREATE POLICY "pay_overrides_select" ON public.pay_package_overrides FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.can_manage_pay_packages(auth.uid())
      OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "pay_overrides_insert" ON public.pay_package_overrides;
CREATE POLICY "pay_overrides_insert" ON public.pay_package_overrides FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));
DROP POLICY IF EXISTS "pay_overrides_update" ON public.pay_package_overrides;
CREATE POLICY "pay_overrides_update" ON public.pay_package_overrides FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));

-- Frozen settlement snapshots: written once by a manager, never changed. A driver may read their own.
DROP POLICY IF EXISTS "settlement_snapshots_select" ON public.settlement_pay_snapshots;
CREATE POLICY "settlement_snapshots_select" ON public.settlement_pay_snapshots FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.can_manage_pay_packages(auth.uid())
      OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "settlement_snapshots_insert" ON public.settlement_pay_snapshots;
CREATE POLICY "settlement_snapshots_insert" ON public.settlement_pay_snapshots FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));

-- No DELETE anywhere: the privilege is simply not granted.
GRANT SELECT, INSERT, UPDATE ON public.pay_packages, public.pay_package_components, public.driver_pay_package_assignments,
  public.pay_package_overrides TO authenticated;
GRANT SELECT, INSERT ON public.pay_package_versions, public.settlement_pay_snapshots TO authenticated;
GRANT ALL ON public.pay_packages, public.pay_package_components, public.pay_package_versions,
  public.driver_pay_package_assignments, public.pay_package_overrides, public.settlement_pay_snapshots TO service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Saving, archiving, assigning (each in one step, so a package is never half saved)
-- ---------------------------------------------------------------------------------------------------------------

-- The package and its live components as one JSON document.
CREATE OR REPLACE FUNCTION public._pay_package_snapshot(_package_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'package', jsonb_build_object(
      'id', p.id, 'name', p.name, 'description', p.description, 'position_type', p.position_type,
      'is_active', p.is_active, 'effective_start', p.effective_start, 'effective_end', p.effective_end
    ),
    'components', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'package_id', c.package_id, 'component_type', c.component_type, 'label', c.label,
        'calculation_method', c.calculation_method, 'value', c.value, 'unit', c.unit, 'formula', c.formula,
        'is_taxable', c.is_taxable, 'is_deduction', c.is_deduction, 'sort_order', c.sort_order, 'is_active', c.is_active
      ) ORDER BY c.sort_order, c.created_at)
      FROM public.pay_package_components c
      WHERE c.package_id = p.id AND c.removed_at IS NULL
    ), '[]'::jsonb)
  )
  FROM public.pay_packages p WHERE p.id = _package_id;
$$;

-- Saves a package and its components together and records a new version. Components that are no longer in the
-- list are marked removed, never deleted. Pass _package_id = NULL to create.
CREATE OR REPLACE FUNCTION public.save_pay_package(_package_id uuid, _package jsonb, _components jsonb, _note text DEFAULT NULL)
RETURNS public.pay_packages
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _pkg public.pay_packages%ROWTYPE;
  _c jsonb;
  _cid uuid;
  _kept uuid[] := ARRAY[]::uuid[];
  _i integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_pay_packages(_uid) THEN RAISE EXCEPTION 'Only owners and payroll admins can change pay packages'; END IF;
  _org := public.get_user_org_id(_uid);
  IF _org IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  IF COALESCE(trim(_package->>'name'), '') = '' THEN RAISE EXCEPTION 'A package needs a name'; END IF;

  IF _package_id IS NULL THEN
    INSERT INTO public.pay_packages (org_id, name, description, position_type, is_active, effective_start, effective_end, created_by)
    VALUES (
      _org, trim(_package->>'name'), NULLIF(_package->>'description', ''),
      COALESCE(NULLIF(_package->>'position_type', ''), 'driver'),
      COALESCE((_package->>'is_active')::boolean, true),
      NULLIF(_package->>'effective_start', '')::date, NULLIF(_package->>'effective_end', '')::date, _uid
    ) RETURNING * INTO _pkg;
  ELSE
    SELECT * INTO _pkg FROM public.pay_packages WHERE id = _package_id AND org_id = _org FOR UPDATE;
    IF _pkg.id IS NULL THEN RAISE EXCEPTION 'Package not found'; END IF;
    UPDATE public.pay_packages SET
      name = trim(_package->>'name'),
      description = NULLIF(_package->>'description', ''),
      position_type = COALESCE(NULLIF(_package->>'position_type', ''), position_type),
      is_active = COALESCE((_package->>'is_active')::boolean, is_active),
      effective_start = NULLIF(_package->>'effective_start', '')::date,
      effective_end = NULLIF(_package->>'effective_end', '')::date
    WHERE id = _pkg.id RETURNING * INTO _pkg;
  END IF;

  FOR _c IN SELECT * FROM jsonb_array_elements(COALESCE(_components, '[]'::jsonb)) LOOP
    _i := _i + 1;
    _cid := NULLIF(_c->>'id', '')::uuid;
    IF _cid IS NOT NULL AND EXISTS (SELECT 1 FROM public.pay_package_components WHERE id = _cid AND package_id = _pkg.id) THEN
      UPDATE public.pay_package_components SET
        component_type = _c->>'component_type', label = _c->>'label', calculation_method = _c->>'calculation_method',
        value = COALESCE((_c->>'value')::numeric, 0), unit = COALESCE(NULLIF(_c->>'unit', ''), 'usd'),
        formula = NULLIF(_c->>'formula', ''), is_taxable = COALESCE((_c->>'is_taxable')::boolean, true),
        is_deduction = COALESCE((_c->>'is_deduction')::boolean, false), sort_order = _i,
        is_active = COALESCE((_c->>'is_active')::boolean, true), removed_at = NULL
      WHERE id = _cid;
    ELSE
      INSERT INTO public.pay_package_components (
        org_id, package_id, component_type, label, calculation_method, value, unit, formula,
        is_taxable, is_deduction, sort_order, is_active
      ) VALUES (
        _org, _pkg.id, _c->>'component_type', _c->>'label', _c->>'calculation_method',
        COALESCE((_c->>'value')::numeric, 0), COALESCE(NULLIF(_c->>'unit', ''), 'usd'), NULLIF(_c->>'formula', ''),
        COALESCE((_c->>'is_taxable')::boolean, true), COALESCE((_c->>'is_deduction')::boolean, false), _i,
        COALESCE((_c->>'is_active')::boolean, true)
      ) RETURNING id INTO _cid;
    END IF;
    _kept := array_append(_kept, _cid);
  END LOOP;

  UPDATE public.pay_package_components SET removed_at = now()
  WHERE package_id = _pkg.id AND removed_at IS NULL AND NOT (id = ANY(_kept));

  UPDATE public.pay_packages SET version_number = version_number + 1 WHERE id = _pkg.id RETURNING * INTO _pkg;
  INSERT INTO public.pay_package_versions (org_id, package_id, version_number, snapshot, change_note, created_by)
  VALUES (_org, _pkg.id, _pkg.version_number, public._pay_package_snapshot(_pkg.id), _note, _uid);

  RETURN _pkg;
END;
$$;

-- Archive and restore: the package stays, its history stays, and a version records it.
CREATE OR REPLACE FUNCTION public.set_pay_package_archived(_package_id uuid, _archived boolean)
RETURNS public.pay_packages
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _pkg public.pay_packages%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_pay_packages(_uid) THEN RAISE EXCEPTION 'Only owners and payroll admins can change pay packages'; END IF;
  _org := public.get_user_org_id(_uid);
  UPDATE public.pay_packages SET
    archived_at = CASE WHEN _archived THEN now() ELSE NULL END,
    archived_by = CASE WHEN _archived THEN _uid ELSE NULL END,
    is_active = NOT _archived,
    version_number = version_number + 1
  WHERE id = _package_id AND org_id = _org RETURNING * INTO _pkg;
  IF _pkg.id IS NULL THEN RAISE EXCEPTION 'Package not found'; END IF;
  INSERT INTO public.pay_package_versions (org_id, package_id, version_number, snapshot, change_note, created_by)
  VALUES (_org, _pkg.id, _pkg.version_number, public._pay_package_snapshot(_pkg.id),
          CASE WHEN _archived THEN 'Archived' ELSE 'Restored from the archive' END, _uid);
  RETURN _pkg;
END;
$$;

-- Puts a package on a person from a date. Whatever assignment they had is ended the day before; nothing is deleted.
CREATE OR REPLACE FUNCTION public.assign_pay_package(_driver_id uuid, _user_id uuid, _package_id uuid, _start date, _note text DEFAULT NULL)
RETURNS public.driver_pay_package_assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _row public.driver_pay_package_assignments%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_pay_packages(_uid) THEN RAISE EXCEPTION 'Only owners and payroll admins can assign pay packages'; END IF;
  _org := public.get_user_org_id(_uid);
  IF _driver_id IS NULL AND _user_id IS NULL THEN RAISE EXCEPTION 'Choose a person'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pay_packages WHERE id = _package_id AND org_id = _org) THEN RAISE EXCEPTION 'Package not found'; END IF;

  UPDATE public.driver_pay_package_assignments
  SET effective_end = _start - 1
  WHERE org_id = _org
    AND ((_driver_id IS NOT NULL AND driver_id = _driver_id) OR (_user_id IS NOT NULL AND user_id = _user_id))
    AND effective_start < _start
    AND (effective_end IS NULL OR effective_end >= _start);

  INSERT INTO public.driver_pay_package_assignments (org_id, package_id, driver_id, user_id, effective_start, note, created_by)
  VALUES (_org, _package_id, _driver_id, _user_id, _start, _note, _uid)
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_pay_packages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_pay_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_pay_package(uuid, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_pay_package_archived(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_pay_package(uuid, uuid, uuid, date, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._pay_package_snapshot(uuid) FROM PUBLIC, authenticated;

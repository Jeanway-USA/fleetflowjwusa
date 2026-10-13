-- Pay packages, positions, hire plans and area limits. Run this whole file once, top to bottom.
-- It is safe to run again: every statement checks before it creates.

-- ===== 20261012180000_7a3d9c52-1e44-4b6f-8c10-5d2f9a7b3e61 =====
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

-- ===== 20261012210000_8b4e0d63-2f55-4c7a-9d21-6e3a0b8c4f72 =====
-- Position templates: a position (Owner-Operator, Dispatcher, ...) sits above pay packages.
--
-- ADDITIVE ONLY. Nothing existing is changed. Positions cannot be deleted by the app (no DELETE policy or
-- privilege); they are archived. Assignments are end-dated, never removed.
--
-- A position holds: a default pay package, the documents a person must sign, default permissions (the app role
-- plus the areas it opens), and an onboarding checklist. Picking a position only SUGGESTS these; everything stays
-- editable for the person afterwards.
--
-- Who can do what: owners and payroll_admin create/edit/archive positions and assign them; everyone else can read
-- only their own assignment, and the position it points to.

CREATE TABLE IF NOT EXISTS public.positions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL,
  key                   text NOT NULL,
  name                  text NOT NULL,
  description           text,
  is_builtin            boolean NOT NULL DEFAULT false,
  default_pay_package_id uuid REFERENCES public.pay_packages (id) ON DELETE RESTRICT,
  default_role          text CHECK (default_role IS NULL OR default_role IN ('owner', 'payroll_admin', 'dispatcher', 'safety', 'driver')),
  default_permissions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents    jsonb NOT NULL DEFAULT '[]'::jsonb,
  onboarding_checklist  jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_onboarding   boolean NOT NULL DEFAULT false,
  sort_order            integer NOT NULL DEFAULT 0,
  archived_at           timestamptz,
  archived_by           uuid,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);
CREATE INDEX IF NOT EXISTS positions_org_idx ON public.positions (org_id);

CREATE TABLE IF NOT EXISTS public.position_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL,
  position_id         uuid NOT NULL REFERENCES public.positions (id) ON DELETE RESTRICT,
  driver_id           uuid,
  user_id             uuid,
  effective_start     date NOT NULL DEFAULT CURRENT_DATE,
  effective_end       date,
  checklist_progress  jsonb NOT NULL DEFAULT '{}'::jsonb,
  note                text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (driver_id IS NOT NULL OR user_id IS NOT NULL),
  CHECK (effective_end IS NULL OR effective_end >= effective_start)
);
CREATE INDEX IF NOT EXISTS position_assignments_driver_idx ON public.position_assignments (driver_id);
CREATE INDEX IF NOT EXISTS position_assignments_user_idx ON public.position_assignments (user_id);

DROP TRIGGER IF EXISTS trg_positions_updated_at ON public.positions;
CREATE TRIGGER trg_positions_updated_at BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_position_assignments_updated_at ON public.position_assignments;
CREATE TRIGGER trg_position_assignments_updated_at BEFORE UPDATE ON public.position_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- True when the person may read this position: they manage packages, or it is the position they hold.
CREATE OR REPLACE FUNCTION public.can_view_position(_position_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.positions p
    WHERE p.id = _position_id
      AND p.org_id = public.get_user_org_id(auth.uid())
      AND (
        public.can_manage_pay_packages(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.position_assignments a
          LEFT JOIN public.drivers d ON d.id = a.driver_id
          WHERE a.position_id = p.id AND (a.user_id = auth.uid() OR d.user_id = auth.uid())
        )
      )
  );
$$;

ALTER TABLE public.positions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "positions_select" ON public.positions;
CREATE POLICY "positions_select" ON public.positions FOR SELECT TO authenticated
  USING (public.can_view_position(id));
DROP POLICY IF EXISTS "positions_insert" ON public.positions;
CREATE POLICY "positions_insert" ON public.positions FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));
DROP POLICY IF EXISTS "positions_update" ON public.positions;
CREATE POLICY "positions_update" ON public.positions FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));

DROP POLICY IF EXISTS "position_assignments_select" ON public.position_assignments;
CREATE POLICY "position_assignments_select" ON public.position_assignments FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.can_manage_pay_packages(auth.uid())
      OR user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "position_assignments_insert" ON public.position_assignments;
CREATE POLICY "position_assignments_insert" ON public.position_assignments FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));
DROP POLICY IF EXISTS "position_assignments_update" ON public.position_assignments;
CREATE POLICY "position_assignments_update" ON public.position_assignments FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()));

-- Archive or restore a position. Nothing is deleted; assignments already made keep pointing at it.
CREATE OR REPLACE FUNCTION public.set_position_archived(_position_id uuid, _archived boolean)
RETURNS public.positions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  result public.positions;
BEGIN
  IF NOT public.can_manage_pay_packages(auth.uid()) THEN
    RAISE EXCEPTION 'Only owners and payroll admins can change positions';
  END IF;
  UPDATE public.positions
     SET archived_at = CASE WHEN _archived THEN now() ELSE NULL END,
         archived_by = CASE WHEN _archived THEN auth.uid() ELSE NULL END
   WHERE id = _position_id AND org_id = public.get_user_org_id(auth.uid())
   RETURNING * INTO result;
  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Position not found';
  END IF;
  RETURN result;
END;
$$;

-- Give someone a position from a date. Any position they held is ended the day before (kept as history).
CREATE OR REPLACE FUNCTION public.assign_position(_position_id uuid, _driver_id uuid, _user_id uuid, _start date, _note text)
RETURNS public.position_assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  org uuid := public.get_user_org_id(auth.uid());
  result public.position_assignments;
BEGIN
  IF NOT public.can_manage_pay_packages(auth.uid()) THEN
    RAISE EXCEPTION 'Only owners and payroll admins can assign positions';
  END IF;
  IF _driver_id IS NULL AND _user_id IS NULL THEN
    RAISE EXCEPTION 'Choose a person';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.positions WHERE id = _position_id AND org_id = org AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'That position is not available';
  END IF;

  UPDATE public.position_assignments
     SET effective_end = GREATEST(effective_start, _start - 1)
   WHERE org_id = org
     AND effective_end IS NULL
     AND ((_driver_id IS NOT NULL AND driver_id = _driver_id) OR (_user_id IS NOT NULL AND user_id = _user_id));

  INSERT INTO public.position_assignments (org_id, position_id, driver_id, user_id, effective_start, note, created_by)
  VALUES (org, _position_id, _driver_id, _user_id, COALESCE(_start, CURRENT_DATE), _note, auth.uid())
  RETURNING * INTO result;
  RETURN result;
END;
$$;

-- Tick or untick one onboarding checklist item for an assignment.
CREATE OR REPLACE FUNCTION public.set_checklist_item(_assignment_id uuid, _item_id text, _done boolean)
RETURNS public.position_assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  result public.position_assignments;
BEGIN
  IF NOT public.can_manage_pay_packages(auth.uid()) THEN
    RAISE EXCEPTION 'Only owners and payroll admins can update the checklist';
  END IF;
  UPDATE public.position_assignments
     SET checklist_progress = CASE
           WHEN _done THEN checklist_progress || jsonb_build_object(_item_id, jsonb_build_object('done_at', now(), 'by', auth.uid()))
           ELSE checklist_progress - _item_id
         END
   WHERE id = _assignment_id AND org_id = public.get_user_org_id(auth.uid())
   RETURNING * INTO result;
  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  RETURN result;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.positions, public.position_assignments TO authenticated;
GRANT ALL ON public.positions, public.position_assignments TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_position(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_position_archived(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_position(uuid, uuid, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_checklist_item(uuid, text, boolean) TO authenticated;

-- ===== 20261012230000_9c5f1e74-3a66-4d8b-8e32-7f4b1c9d5a83 =====
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
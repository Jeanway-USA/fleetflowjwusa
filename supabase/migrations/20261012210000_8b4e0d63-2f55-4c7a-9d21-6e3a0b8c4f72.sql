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

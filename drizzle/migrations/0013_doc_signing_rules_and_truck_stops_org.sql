CREATE OR REPLACE FUNCTION public.can_sign_document_step(_instance_id uuid, _step int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.document_instances di
    WHERE di.id = _instance_id
      AND di.org_id = public.get_user_org_id(auth.uid())
      AND di.status = 'pending_signatures'
      AND di.current_step = _step
      AND (
        di.assigned_to_user = auth.uid()
        OR (di.signatory_roles[_step + 1] = 'driver' AND di.driver_id IS NOT NULL
            AND di.driver_id = public.get_driver_id_for_user(auth.uid()))
        OR (di.signatory_roles[_step + 1] = 'owner' AND public.is_owner(auth.uid()))
        OR (di.signatory_roles[_step + 1] <> 'driver' AND EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid() AND ur.org_id = di.org_id
                AND ur.role::text = di.signatory_roles[_step + 1]))
      )
  )
$$;

DROP POLICY IF EXISTS signatures_insert_self ON public.document_signatures;
CREATE POLICY signatures_insert_self ON public.document_signatures
FOR INSERT TO authenticated
WITH CHECK (
  signer_id = auth.uid()
  AND org_id = public.get_user_org_id(auth.uid())
  AND public.can_sign_document_step(instance_id, step_index)
);

CREATE OR REPLACE FUNCTION public.guard_document_instance_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _total int; _signed int;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    _total := COALESCE(array_length(NEW.signatory_roles, 1), 0);
    SELECT count(DISTINCT step_index) INTO _signed
      FROM public.document_signatures WHERE instance_id = NEW.id;
    IF _signed < _total THEN
      RAISE EXCEPTION 'Document cannot be completed until all required signatures are collected';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_document_instance_completion ON public.document_instances;
CREATE TRIGGER trg_guard_document_instance_completion
BEFORE UPDATE ON public.document_instances
FOR EACH ROW EXECUTE FUNCTION public.guard_document_instance_completion();

ALTER TABLE public.truck_stops ADD COLUMN IF NOT EXISTS org_id uuid;
CREATE INDEX IF NOT EXISTS idx_truck_stops_org_id ON public.truck_stops(org_id);
DROP POLICY IF EXISTS "Authenticated users can read truck stops" ON public.truck_stops;
CREATE POLICY "Users read own org or shared truck stops" ON public.truck_stops
FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (deleted_at IS NULL AND (org_id IS NULL OR org_id = public.get_user_org_id(auth.uid())))
);
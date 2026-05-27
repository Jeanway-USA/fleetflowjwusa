CREATE OR REPLACE FUNCTION public.set_maintenance_request_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_maintenance_request_org_id_trg ON public.maintenance_requests;
CREATE TRIGGER set_maintenance_request_org_id_trg
  BEFORE INSERT ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_maintenance_request_org_id();

CREATE POLICY "Maintenance role can view maintenance requests"
  ON public.maintenance_requests FOR SELECT
  USING (has_role(auth.uid(), 'maintenance'::app_role)
         AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Maintenance role can update maintenance requests"
  ON public.maintenance_requests FOR UPDATE
  USING (has_role(auth.uid(), 'maintenance'::app_role)
         AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));
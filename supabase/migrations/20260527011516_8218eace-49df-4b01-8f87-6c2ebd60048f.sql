CREATE OR REPLACE FUNCTION public.set_driver_request_org_id()
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

DROP TRIGGER IF EXISTS set_driver_request_org_id_trg ON public.driver_requests;
CREATE TRIGGER set_driver_request_org_id_trg
BEFORE INSERT ON public.driver_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_driver_request_org_id();
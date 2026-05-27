CREATE OR REPLACE FUNCTION public.set_trucks_org_id()
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

DROP TRIGGER IF EXISTS set_trucks_org_id_trg ON public.trucks;
CREATE TRIGGER set_trucks_org_id_trg
BEFORE INSERT ON public.trucks
FOR EACH ROW
EXECUTE FUNCTION public.set_trucks_org_id();
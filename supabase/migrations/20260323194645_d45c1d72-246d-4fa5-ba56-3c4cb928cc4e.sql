CREATE OR REPLACE FUNCTION public.log_load_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.load_status_logs (load_id, previous_status, new_status, changed_by, org_id)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NEW.org_id);
  END IF;
  RETURN NEW;
END;
$$;

UPDATE load_status_logs SET org_id = fl.org_id
FROM fleet_loads fl
WHERE fl.id = load_status_logs.load_id
AND load_status_logs.org_id IS NULL;
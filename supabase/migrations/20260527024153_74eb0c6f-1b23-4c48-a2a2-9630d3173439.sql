
CREATE OR REPLACE FUNCTION public.complete_linked_maintenance_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.maintenance_requests
    SET status = 'completed', updated_at = now()
    WHERE status <> 'completed'
      AND admin_notes LIKE 'Converted to work order ' || NEW.id::text || '%';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_linked_maintenance_request ON public.work_orders;
CREATE TRIGGER trg_complete_linked_maintenance_request
AFTER UPDATE OF status ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.complete_linked_maintenance_request();

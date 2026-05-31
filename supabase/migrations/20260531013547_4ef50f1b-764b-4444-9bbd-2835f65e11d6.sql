-- Restrict drivers from modifying financial/sensitive columns on fleet_loads.
-- Drivers retain ability to update only operational fields (status, POD, location-related, timestamps).

CREATE OR REPLACE FUNCTION public.enforce_driver_fleet_loads_column_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_is_assigned_driver boolean;
BEGIN
  -- Bypass for service_role / no auth context (edge functions, triggers, admin tools)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.has_admin_access(auth.uid());
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  v_is_assigned_driver := (OLD.driver_id IS NOT NULL
    AND OLD.driver_id = public.get_driver_id_for_user(auth.uid()));

  IF NOT v_is_assigned_driver THEN
    -- RLS should have already blocked this; defense in depth.
    RETURN NEW;
  END IF;

  -- Driver path: only allow specific operational columns to change.
  IF NEW.rate IS DISTINCT FROM OLD.rate
     OR NEW.fuel_surcharge IS DISTINCT FROM OLD.fuel_surcharge
     OR NEW.gross_revenue IS DISTINCT FROM OLD.gross_revenue
     OR NEW.net_revenue IS DISTINCT FROM OLD.net_revenue
     OR NEW.truck_revenue IS DISTINCT FROM OLD.truck_revenue
     OR NEW.trailer_revenue IS DISTINCT FROM OLD.trailer_revenue
     OR NEW.settlement IS DISTINCT FROM OLD.settlement
     OR NEW.accessorials IS DISTINCT FROM OLD.accessorials
     OR NEW.lumper IS DISTINCT FROM OLD.lumper
     OR NEW.detention_pay IS DISTINCT FROM OLD.detention_pay
     OR NEW.invoice_status IS DISTINCT FROM OLD.invoice_status
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_url IS DISTINCT FROM OLD.invoice_url
     OR NEW.factoring_status IS DISTINCT FROM OLD.factoring_status
     OR NEW.factoring_submission_id IS DISTINCT FROM OLD.factoring_submission_id
     OR NEW.advance_taken IS DISTINCT FROM OLD.advance_taken
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.truck_id IS DISTINCT FROM OLD.truck_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.destination IS DISTINCT FROM OLD.destination
     OR NEW.booked_miles IS DISTINCT FROM OLD.booked_miles
     OR NEW.pickup_date IS DISTINCT FROM OLD.pickup_date
     OR NEW.delivery_date IS DISTINCT FROM OLD.delivery_date
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify financial or assignment fields on loads'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_driver_fleet_loads_column_restrictions ON public.fleet_loads;

CREATE TRIGGER trg_enforce_driver_fleet_loads_column_restrictions
BEFORE UPDATE ON public.fleet_loads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_driver_fleet_loads_column_restrictions();
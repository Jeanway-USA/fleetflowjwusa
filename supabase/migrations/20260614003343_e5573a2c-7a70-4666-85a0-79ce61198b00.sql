-- Phase 1: Schema for dynamic route recalculation
ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS current_route_geometry jsonb,
  ADD COLUMN IF NOT EXISTS current_route_origin jsonb,
  ADD COLUMN IF NOT EXISTS current_route_updated_at timestamptz;

COMMENT ON COLUMN public.fleet_loads.current_route_geometry IS
  'Array of [lat,lng] tuples representing the most recently calculated route from the driver''s live GPS to destination.';
COMMENT ON COLUMN public.fleet_loads.current_route_origin IS
  '{lat,lng} of the GPS point that produced current_route_geometry. Used to apply a distance threshold before recalculating.';

-- Realtime publication so dispatcher map, driver HUD, and other authenticated views can subscribe
ALTER TABLE public.fleet_loads REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'fleet_loads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_loads';
  END IF;
END $$;

-- Allow the assigned driver to write ONLY these route fields (existing trigger blocks every other change)
CREATE OR REPLACE FUNCTION public.enforce_driver_fleet_loads_column_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_is_assigned_driver boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  v_is_admin := public.has_admin_access(auth.uid());
  IF v_is_admin THEN RETURN NEW; END IF;

  v_is_assigned_driver := (OLD.driver_id IS NOT NULL
    AND OLD.driver_id = public.get_driver_id_for_user(auth.uid()));
  IF NOT v_is_assigned_driver THEN RETURN NEW; END IF;

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
     OR NEW.detention_hours IS DISTINCT FROM OLD.detention_hours
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
     OR NEW.height_inches IS DISTINCT FROM OLD.height_inches
     OR NEW.width_inches IS DISTINCT FROM OLD.width_inches
     OR NEW.length_inches IS DISTINCT FROM OLD.length_inches
     OR NEW.is_in_bond IS DISTINCT FROM OLD.is_in_bond
     OR NEW.cf_7512_number IS DISTINCT FROM OLD.cf_7512_number
     OR NEW.is_spotted_trailer IS DISTINCT FROM OLD.is_spotted_trailer
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify financial or assignment fields on loads'
      USING ERRCODE = '42501';
  END IF;

  -- current_route_geometry / current_route_origin / current_route_updated_at are intentionally allowed
  RETURN NEW;
END;
$function$;
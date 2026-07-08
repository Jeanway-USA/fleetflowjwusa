
CREATE OR REPLACE FUNCTION public.get_public_load_by_tracking(_tracking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _load public.fleet_loads%ROWTYPE;
  _stops jsonb;
BEGIN
  SELECT * INTO _load
  FROM public.fleet_loads
  WHERE tracking_id = _tracking_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'stop_number', s.stop_number,
      'stop_type', s.stop_type,
      'facility_name', s.facility_name,
      'location', s.location,
      'scheduled_date', s.scheduled_date,
      'status', s.status,
      'completed_at', s.completed_at
    ) ORDER BY s.stop_number
  ), '[]'::jsonb)
  INTO _stops
  FROM public.load_intermediate_stops s
  WHERE s.load_id = _load.id;

  RETURN jsonb_build_object(
    'tracking_id', _load.tracking_id,
    'landstar_load_id', _load.landstar_load_id,
    'status', _load.status,
    'origin', _load.origin,
    'destination', _load.destination,
    'pickup_date', _load.pickup_date,
    'pickup_time', _load.pickup_time,
    'pickup_time_type', _load.pickup_time_type,
    'delivery_date', _load.delivery_date,
    'delivery_time', _load.delivery_time,
    'delivery_time_type', _load.delivery_time_type,
    'pickup_at', _load.pickup_at,
    'delivery_at', _load.delivery_at,
    'current_route_updated_at', _load.current_route_updated_at,
    'stops', _stops
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_load_by_tracking(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_load_by_tracking(uuid) TO anon, authenticated;

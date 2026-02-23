CREATE OR REPLACE FUNCTION public.truck_stop_brand_counts()
RETURNS TABLE(brand text, stop_count bigint, latest_sync timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT brand, count(*)::bigint, max(updated_at)
  FROM official_truck_stops
  GROUP BY brand;
$$;
-- Update the default service schedules trigger to use manufacturer-specific intervals
CREATE OR REPLACE FUNCTION public.create_default_service_schedules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  oil_interval INTEGER;
  tire_interval INTEGER;
BEGIN
  -- Determine oil change interval based on make
  -- Freightliner with Detroit engines: 60,000 miles
  -- Kenworth/Peterbilt with PACCAR engines: 50,000 miles
  -- International: 40,000 miles
  -- Default: 25,000 miles (conservative estimate)
  CASE LOWER(COALESCE(NEW.make, ''))
    WHEN 'freightliner' THEN oil_interval := 60000;
    WHEN 'kenworth' THEN oil_interval := 50000;
    WHEN 'peterbilt' THEN oil_interval := 50000;
    WHEN 'international' THEN oil_interval := 40000;
    WHEN 'volvo' THEN oil_interval := 50000;
    WHEN 'mack' THEN oil_interval := 50000;
    ELSE oil_interval := 25000;
  END CASE;
  
  -- Tire intervals are relatively consistent across makes
  tire_interval := 80000;
  
  -- Oil Change
  INSERT INTO public.service_schedules (truck_id, service_name, interval_miles)
  VALUES (NEW.id, 'Oil Change', oil_interval);
  
  -- Tire Replacement
  INSERT INTO public.service_schedules (truck_id, service_name, interval_miles)
  VALUES (NEW.id, 'Tire Replacement', tire_interval);
  
  -- 120-Day Inspection (Landstar requirement - stays at 120 days)
  INSERT INTO public.service_schedules (truck_id, service_name, interval_days)
  VALUES (NEW.id, '120-Day Inspection', 120);
  
  RETURN NEW;
END;
$function$;
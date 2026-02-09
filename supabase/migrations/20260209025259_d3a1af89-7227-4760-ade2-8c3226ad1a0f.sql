CREATE OR REPLACE FUNCTION public.sync_fuel_expense_to_ifta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver_id uuid;
  v_price_per_gallon numeric;
  v_total_cost numeric;
  v_gallons numeric;
BEGIN
  -- Handle DELETE: remove the corresponding fuel_purchases record
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.fuel_purchases WHERE source_expense_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Only sync Fuel, DEF, and Fuel Discount expense types
  IF NEW.expense_type NOT IN ('Fuel', 'DEF', 'Fuel Discount') THEN
    -- If type changed FROM a syncable type to something else, clean up
    IF TG_OP = 'UPDATE' AND OLD.expense_type IN ('Fuel', 'DEF', 'Fuel Discount') THEN
      DELETE FROM public.fuel_purchases WHERE source_expense_id = OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Skip if no jurisdiction (IFTA requires a state)
  IF NEW.jurisdiction IS NULL OR NEW.jurisdiction = '' THEN
    -- If jurisdiction was removed, clean up existing record
    IF TG_OP = 'UPDATE' THEN
      DELETE FROM public.fuel_purchases WHERE source_expense_id = OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  -- For Fuel Discount expenses, negate the cost and set gallons to 0
  IF NEW.expense_type = 'Fuel Discount' THEN
    v_total_cost := -1 * ABS(NEW.amount);
    v_gallons := 0;
    v_price_per_gallon := 0;
  ELSE
    v_total_cost := NEW.amount;
    v_gallons := COALESCE(NEW.gallons, 0);
    IF v_gallons > 0 THEN
      v_price_per_gallon := ROUND(NEW.amount / v_gallons, 4);
    ELSE
      v_price_per_gallon := 0;
    END IF;
  END IF;

  -- Look up driver_id from linked load if available
  v_driver_id := NULL;
  IF NEW.load_id IS NOT NULL THEN
    SELECT driver_id INTO v_driver_id
    FROM public.fleet_loads
    WHERE id = NEW.load_id;
  END IF;

  -- Upsert into fuel_purchases
  INSERT INTO public.fuel_purchases (
    source_expense_id,
    purchase_date,
    truck_id,
    driver_id,
    gallons,
    price_per_gallon,
    total_cost,
    jurisdiction,
    vendor
  ) VALUES (
    NEW.id,
    NEW.expense_date,
    NEW.truck_id,
    v_driver_id,
    v_gallons,
    v_price_per_gallon,
    v_total_cost,
    NEW.jurisdiction,
    COALESCE(NEW.vendor, 'NATS Discount')
  )
  ON CONFLICT (source_expense_id)
  DO UPDATE SET
    purchase_date = EXCLUDED.purchase_date,
    truck_id = EXCLUDED.truck_id,
    driver_id = EXCLUDED.driver_id,
    gallons = EXCLUDED.gallons,
    price_per_gallon = EXCLUDED.price_per_gallon,
    total_cost = EXCLUDED.total_cost,
    jurisdiction = EXCLUDED.jurisdiction,
    vendor = EXCLUDED.vendor,
    updated_at = now();

  RETURN NEW;
END;
$$;
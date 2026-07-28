CREATE OR REPLACE FUNCTION public.generate_safety_bonus_payouts(_period_start date)
 RETURNS TABLE(driver_id uuid, safe_miles integer, earned_amount numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_user_id uuid := auth.uid();
  v_period_end date;
  v_settings record;
  v_driver record;
  v_tier record;
  v_miles integer;
  v_earned numeric;
  v_in_tier numeric;
  v_ceiling numeric;
  v_ineligible boolean;
  v_reason text;
  v_status text;
BEGIN
  IF NOT (is_owner(v_user_id) OR has_role(v_user_id, 'payroll_admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_org_id := get_user_org_id(v_user_id);
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;

  _period_start := date_trunc('month', _period_start)::date;
  v_period_end := (date_trunc('month', _period_start) + interval '1 month - 1 day')::date;

  SELECT * INTO v_settings FROM public.safety_bonus_settings s WHERE s.org_id = v_org_id LIMIT 1;
  IF v_settings IS NULL THEN RAISE EXCEPTION 'Safety bonus not configured'; END IF;

  FOR v_driver IN
    SELECT d.id FROM public.drivers d WHERE d.org_id = v_org_id AND d.status = 'active'
  LOOP
    SELECT COALESCE(SUM(COALESCE(fl.actual_miles, fl.booked_miles, 0)), 0)::integer
      INTO v_miles
      FROM public.fleet_loads fl
     WHERE fl.driver_id = v_driver.id
       AND fl.status = 'delivered'
       AND fl.delivery_date >= _period_start
       AND fl.delivery_date <= v_period_end;

    v_ineligible := false;
    v_reason := NULL;

    IF v_settings.requires_zero_accidents THEN
      IF EXISTS (
        SELECT 1 FROM public.incidents i
         WHERE i.driver_id = v_driver.id
           AND i.incident_type = 'accident'
           AND COALESCE(LOWER(i.severity), '') <> 'minor'
           AND i.incident_date >= _period_start AND i.incident_date <= v_period_end
      ) THEN v_ineligible := true; v_reason := 'Accident in period'; END IF;
    END IF;

    IF NOT v_ineligible AND v_settings.requires_zero_csa_points THEN
      IF EXISTS (
        SELECT 1 FROM public.incidents i
         WHERE i.driver_id = v_driver.id
           AND i.citation_issued = true
           AND i.incident_date >= _period_start AND i.incident_date <= v_period_end
      ) THEN v_ineligible := true; v_reason := 'CSA citation in period'; END IF;
    END IF;

    IF NOT v_ineligible AND v_settings.requires_zero_service_failures THEN
      IF EXISTS (
        SELECT 1 FROM public.fleet_loads fl
         WHERE fl.driver_id = v_driver.id
           AND fl.status IN ('late','service_failure')
           AND fl.delivery_date >= _period_start AND fl.delivery_date <= v_period_end
      ) THEN v_ineligible := true; v_reason := 'Service failure in period'; END IF;
    END IF;

    v_earned := 0;
    IF NOT v_ineligible AND v_miles > 0 THEN
      FOR v_tier IN
        SELECT t.min_miles, t.max_miles, t.rate_per_mile
          FROM public.safety_bonus_tiers t
         WHERE t.setting_id = v_settings.id
         ORDER BY t.min_miles ASC
      LOOP
        IF v_miles <= v_tier.min_miles THEN EXIT; END IF;
        v_ceiling := COALESCE(v_tier.max_miles::numeric, v_miles::numeric);
        v_in_tier := LEAST(v_miles::numeric, v_ceiling) - v_tier.min_miles::numeric;
        IF v_in_tier > 0 THEN
          v_earned := v_earned + v_in_tier * v_tier.rate_per_mile;
        END IF;
      END LOOP;
      IF v_settings.max_bonus_amount > 0 AND v_earned > v_settings.max_bonus_amount THEN
        v_earned := v_settings.max_bonus_amount;
      END IF;
    END IF;

    v_status := CASE WHEN v_ineligible THEN 'void' ELSE 'pending' END;

    INSERT INTO public.safety_bonus_payouts AS p
      (org_id, driver_id, period_start, period_end, safe_miles, earned_amount, status, notes, created_by)
    VALUES
      (v_org_id, v_driver.id, _period_start, v_period_end, v_miles, ROUND(v_earned, 2), v_status, v_reason, v_user_id)
    ON CONFLICT (driver_id, period_start) DO UPDATE
      SET safe_miles = EXCLUDED.safe_miles,
          earned_amount = EXCLUDED.earned_amount,
          status = CASE
                     WHEN p.status IN ('paid','approved')
                     THEN p.status
                     ELSE EXCLUDED.status
                   END,
          notes = EXCLUDED.notes,
          updated_at = now();

    generate_safety_bonus_payouts.driver_id := v_driver.id;
    generate_safety_bonus_payouts.safe_miles := v_miles;
    generate_safety_bonus_payouts.earned_amount := ROUND(v_earned, 2);
    generate_safety_bonus_payouts.status := v_status;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;
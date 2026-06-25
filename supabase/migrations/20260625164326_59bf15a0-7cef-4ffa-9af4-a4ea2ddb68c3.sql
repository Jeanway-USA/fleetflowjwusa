
-- 1) Generation: stop auto-pulling reimbursements from expenses
CREATE OR REPLACE FUNCTION public.generate_driver_settlements(_driver_ids uuid[], _period_end date, _payment_date date)
 RETURNS SETOF driver_settlements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _truck_pct numeric;
  _driver record;
  _period_start date;
  _settlement public.driver_settlements%ROWTYPE;
  _gross numeric;
  _ytd_gross numeric;
  _ytd_reimb numeric;
  _ytd_net numeric;
  _year_start date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_owner(_uid) OR public.has_role(_uid, 'payroll_admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  _org := public.get_user_org_id(_uid);
  IF _org IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  IF _period_end IS NULL OR _payment_date IS NULL THEN
    RAISE EXCEPTION 'period_end and payment_date are required';
  END IF;

  SELECT COALESCE(NULLIF(regexp_replace(setting_value, '[^0-9.]', '', 'g'), '')::numeric, 0.65)
  INTO _truck_pct
  FROM public.company_settings
  WHERE org_id = _org AND setting_key = 'truck_percentage' LIMIT 1;
  IF _truck_pct IS NULL THEN _truck_pct := 0.65;
  ELSIF _truck_pct > 1 THEN _truck_pct := _truck_pct / 100.0;
  END IF;

  _year_start := date_trunc('year', _period_end)::date;

  FOR _driver IN
    SELECT d.id, d.pay_type, d.pay_rate, d.hire_date
    FROM public.drivers d
    WHERE d.org_id = _org
      AND (_driver_ids IS NULL OR d.id = ANY(_driver_ids))
      AND (_driver_ids IS NOT NULL OR d.status = 'active')
  LOOP
    SELECT MAX(period_end) + 1 INTO _period_start
    FROM public.driver_settlements
    WHERE org_id = _org AND driver_id = _driver.id;
    IF _period_start IS NULL THEN
      SELECT MIN(delivery_date) INTO _period_start
      FROM public.fleet_loads
      WHERE org_id = _org AND driver_id = _driver.id
        AND status = 'delivered' AND delivery_date IS NOT NULL;
    END IF;
    IF _period_start IS NULL THEN
      _period_start := COALESCE(_driver.hire_date, DATE '1900-01-01');
    END IF;
    IF _period_start > _period_end THEN CONTINUE; END IF;

    WITH loads AS (
      SELECT l.id, l.rate, l.fuel_surcharge, l.actual_miles, l.booked_miles,
             COALESCE(SUM(a.amount) FILTER (WHERE a.is_driver_pay), 0) AS access_total
      FROM public.fleet_loads l
      LEFT JOIN public.load_accessorials a ON a.load_id = l.id
      WHERE l.org_id = _org AND l.driver_id = _driver.id
        AND l.status = 'delivered'
        AND l.delivery_date BETWEEN _period_start AND _period_end
      GROUP BY l.id
    )
    SELECT COALESCE(SUM(
      CASE _driver.pay_type
        WHEN 'percentage' THEN (COALESCE(rate,0) * _truck_pct) + COALESCE(fuel_surcharge,0) + access_total
        WHEN 'per_mile' THEN (COALESCE(actual_miles, booked_miles, 0) * COALESCE(_driver.pay_rate,0)) + access_total
        WHEN 'flat' THEN COALESCE(_driver.pay_rate,0) + access_total
        ELSE 0
      END
    ), 0) INTO _gross FROM loads;

    IF _gross = 0 THEN CONTINUE; END IF;

    INSERT INTO public.driver_settlements (
      org_id, driver_id, period_start, period_end, payment_date,
      gross_pay, reimbursements, status, generated_by, generated_at,
      ytd_gross, ytd_reimbursements, ytd_net
    ) VALUES (
      _org, _driver.id, _period_start, _period_end, _payment_date,
      _gross, 0, 'draft', _uid, now(), 0, 0, 0
    ) RETURNING * INTO _settlement;

    INSERT INTO public.driver_settlement_items (org_id, settlement_id, item_type, load_id, description, amount)
    SELECT _org, _settlement.id, 'load_pay', l.id,
      'Load #' || COALESCE(l.landstar_load_id, substring(l.id::text,1,8)) || ' ' || COALESCE(l.origin,'') || ' → ' || COALESCE(l.destination,''),
      CASE _driver.pay_type
        WHEN 'percentage' THEN (COALESCE(l.rate,0) * _truck_pct) + COALESCE(l.fuel_surcharge,0) + COALESCE((SELECT SUM(a.amount) FROM public.load_accessorials a WHERE a.load_id = l.id AND a.is_driver_pay),0)
        WHEN 'per_mile' THEN (COALESCE(l.actual_miles, l.booked_miles, 0) * COALESCE(_driver.pay_rate,0)) + COALESCE((SELECT SUM(a.amount) FROM public.load_accessorials a WHERE a.load_id = l.id AND a.is_driver_pay),0)
        WHEN 'flat' THEN COALESCE(_driver.pay_rate,0) + COALESCE((SELECT SUM(a.amount) FROM public.load_accessorials a WHERE a.load_id = l.id AND a.is_driver_pay),0)
        ELSE 0
      END
    FROM public.fleet_loads l
    WHERE l.org_id = _org AND l.driver_id = _driver.id
      AND l.status = 'delivered'
      AND l.delivery_date BETWEEN _period_start AND _period_end;

    SELECT COALESCE(SUM(gross_pay),0), COALESCE(SUM(reimbursements),0), COALESCE(SUM(net_pay),0)
    INTO _ytd_gross, _ytd_reimb, _ytd_net
    FROM public.driver_settlements
    WHERE org_id = _org AND driver_id = _driver.id
      AND period_end >= _year_start AND period_end <= _period_end;

    UPDATE public.driver_settlements
    SET ytd_gross = _ytd_gross, ytd_reimbursements = _ytd_reimb, ytd_net = _ytd_net
    WHERE id = _settlement.id
    RETURNING * INTO _settlement;

    RETURN NEXT _settlement;
  END LOOP;
  RETURN;
END;
$function$;

-- 2) Helper to recompute a settlement's reimbursements + YTD after manual edits
CREATE OR REPLACE FUNCTION public.recalc_settlement_totals(_settlement_id uuid)
 RETURNS driver_settlements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.driver_settlements%ROWTYPE;
  _org uuid;
  _reimb numeric;
  _year_start date;
  _ytd_gross numeric;
  _ytd_reimb numeric;
  _ytd_net numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_owner(_uid) OR public.has_role(_uid, 'payroll_admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  _org := public.get_user_org_id(_uid);

  SELECT * INTO _s FROM public.driver_settlements WHERE id = _settlement_id AND org_id = _org;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Settlement not found'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _reimb
  FROM public.driver_settlement_items
  WHERE settlement_id = _settlement_id AND item_type = 'reimbursement';

  UPDATE public.driver_settlements
  SET reimbursements = _reimb, updated_at = now()
  WHERE id = _settlement_id;

  _year_start := date_trunc('year', _s.period_end)::date;

  SELECT COALESCE(SUM(gross_pay),0), COALESCE(SUM(reimbursements),0), COALESCE(SUM(net_pay),0)
  INTO _ytd_gross, _ytd_reimb, _ytd_net
  FROM public.driver_settlements
  WHERE org_id = _org AND driver_id = _s.driver_id
    AND period_end >= _year_start AND period_end <= _s.period_end;

  UPDATE public.driver_settlements
  SET ytd_gross = _ytd_gross, ytd_reimbursements = _ytd_reimb, ytd_net = _ytd_net
  WHERE id = _settlement_id
  RETURNING * INTO _s;

  RETURN _s;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_settlement_totals(uuid) TO authenticated;

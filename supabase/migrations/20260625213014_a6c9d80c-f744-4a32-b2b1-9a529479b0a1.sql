
-- 1. Extend item_type to include 'deduction'
ALTER TABLE public.driver_settlement_items
  DROP CONSTRAINT IF EXISTS driver_settlement_items_item_type_check;
ALTER TABLE public.driver_settlement_items
  ADD CONSTRAINT driver_settlement_items_item_type_check
  CHECK (item_type IN ('load_pay','reimbursement','deduction'));

-- 2. Add deductions columns to driver_settlements (drop generated net_pay first)
ALTER TABLE public.driver_settlements
  DROP COLUMN IF EXISTS net_pay;

ALTER TABLE public.driver_settlements
  ADD COLUMN IF NOT EXISTS deductions numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ytd_deductions numeric NOT NULL DEFAULT 0;

ALTER TABLE public.driver_settlements
  ADD COLUMN net_pay numeric
  GENERATED ALWAYS AS (gross_pay + reimbursements - deductions) STORED;

-- 3. Update recalc_settlement_totals to fold in deductions + new YTD aggregates
CREATE OR REPLACE FUNCTION public.recalc_settlement_totals(_settlement_id uuid)
 RETURNS driver_settlements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _s public.driver_settlements%ROWTYPE;
  _org uuid;
  _reimb numeric;
  _ded numeric;
  _year_start date;
  _ytd_gross numeric;
  _ytd_reimb numeric;
  _ytd_ded numeric;
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

  SELECT COALESCE(SUM(amount), 0) INTO _ded
  FROM public.driver_settlement_items
  WHERE settlement_id = _settlement_id AND item_type = 'deduction';

  UPDATE public.driver_settlements
  SET reimbursements = _reimb, deductions = _ded, updated_at = now()
  WHERE id = _settlement_id;

  _year_start := date_trunc('year', _s.period_end)::date;

  SELECT COALESCE(SUM(gross_pay),0),
         COALESCE(SUM(reimbursements),0),
         COALESCE(SUM(deductions),0),
         COALESCE(SUM(net_pay),0)
  INTO _ytd_gross, _ytd_reimb, _ytd_ded, _ytd_net
  FROM public.driver_settlements
  WHERE org_id = _org AND driver_id = _s.driver_id
    AND period_end >= _year_start AND period_end <= _s.period_end;

  UPDATE public.driver_settlements
  SET ytd_gross = _ytd_gross,
      ytd_reimbursements = _ytd_reimb,
      ytd_deductions = _ytd_ded,
      ytd_net = _ytd_net
  WHERE id = _settlement_id
  RETURNING * INTO _s;

  RETURN _s;
END;
$function$;

-- 4. Update generate_driver_settlements to seed deductions=0 and roll YTD deductions
CREATE OR REPLACE FUNCTION public.generate_driver_settlements(_driver_ids uuid[], _period_start date, _period_end date, _payment_date date)
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
  _ps date;
  _settlement public.driver_settlements%ROWTYPE;
  _gross numeric;
  _norm_pay_type text;
  _has_activity boolean;
  _ytd_gross numeric;
  _ytd_reimb numeric;
  _ytd_ded numeric;
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
  IF _period_start IS NOT NULL AND _period_start > _period_end THEN
    RAISE EXCEPTION 'period_start must be on or before period_end';
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
    _norm_pay_type := lower(COALESCE(_driver.pay_type, ''));
    IF _norm_pay_type = 'cpm' THEN _norm_pay_type := 'per_mile'; END IF;

    IF _period_start IS NOT NULL THEN
      _ps := _period_start;
    ELSE
      SELECT MAX(period_end) + 1 INTO _ps
      FROM public.driver_settlements
      WHERE org_id = _org AND driver_id = _driver.id;
      IF _ps IS NULL THEN
        IF _norm_pay_type = 'flat' THEN
          SELECT MIN(COALESCE(pickup_date, delivery_date)) INTO _ps
          FROM public.fleet_loads
          WHERE org_id = _org AND driver_id = _driver.id
            AND COALESCE(status, '') NOT IN ('cancelled','canceled','voided','draft');
        ELSE
          SELECT MIN(COALESCE(delivery_date, pickup_date)) INTO _ps
          FROM public.fleet_loads
          WHERE org_id = _org AND driver_id = _driver.id
            AND status = 'delivered';
        END IF;
      END IF;
      IF _ps IS NULL THEN
        _ps := COALESCE(_driver.hire_date, DATE '1900-01-01');
      END IF;
    END IF;
    IF _ps > _period_end THEN CONTINUE; END IF;

    _gross := 0;
    _has_activity := false;

    IF _norm_pay_type = 'flat' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.fleet_loads l
        WHERE l.org_id = _org AND l.driver_id = _driver.id
          AND COALESCE(l.status, '') NOT IN ('cancelled','canceled','voided','draft')
          AND COALESCE(l.pickup_date, l.delivery_date) <= _period_end
          AND COALESCE(l.delivery_date, l.pickup_date) >= _ps
      ) INTO _has_activity;

      IF _has_activity THEN
        _gross := COALESCE(_driver.pay_rate, 0);
      END IF;

    ELSIF _norm_pay_type = 'per_mile' THEN
      SELECT COALESCE(SUM(COALESCE(l.booked_miles, l.actual_miles, 0)), 0) * COALESCE(_driver.pay_rate, 0)
      INTO _gross
      FROM public.fleet_loads l
      WHERE l.org_id = _org AND l.driver_id = _driver.id
        AND l.status = 'delivered'
        AND l.delivery_date BETWEEN _ps AND _period_end;

    ELSIF _norm_pay_type = 'percentage' THEN
      SELECT COALESCE(SUM(COALESCE(l.rate,0) * _truck_pct * COALESCE(_driver.pay_rate,0) / 100.0), 0)
      INTO _gross
      FROM public.fleet_loads l
      WHERE l.org_id = _org AND l.driver_id = _driver.id
        AND l.status = 'delivered'
        AND l.delivery_date BETWEEN _ps AND _period_end;

    ELSE
      CONTINUE;
    END IF;

    IF _gross IS NULL OR _gross = 0 THEN CONTINUE; END IF;

    INSERT INTO public.driver_settlements (
      org_id, driver_id, period_start, period_end, payment_date,
      gross_pay, reimbursements, deductions, status, generated_by, generated_at,
      ytd_gross, ytd_reimbursements, ytd_deductions, ytd_net
    ) VALUES (
      _org, _driver.id, _ps, _period_end, _payment_date,
      _gross, 0, 0, 'draft', _uid, now(), 0, 0, 0, 0
    ) RETURNING * INTO _settlement;

    IF _norm_pay_type = 'flat' THEN
      INSERT INTO public.driver_settlement_items (org_id, settlement_id, item_type, description, amount)
      VALUES (_org, _settlement.id, 'load_pay', 'Flat weekly pay', _gross);

    ELSIF _norm_pay_type = 'per_mile' THEN
      INSERT INTO public.driver_settlement_items (org_id, settlement_id, item_type, load_id, description, amount)
      SELECT _org, _settlement.id, 'load_pay', l.id,
        'Load #' || COALESCE(l.landstar_load_id, substring(l.id::text,1,8)) || ' ' || COALESCE(l.origin,'') || ' -> ' || COALESCE(l.destination,'') ||
          ' (' || COALESCE(l.booked_miles, l.actual_miles, 0)::text || ' mi)',
        COALESCE(l.booked_miles, l.actual_miles, 0) * COALESCE(_driver.pay_rate, 0)
      FROM public.fleet_loads l
      WHERE l.org_id = _org AND l.driver_id = _driver.id
        AND l.status = 'delivered'
        AND l.delivery_date BETWEEN _ps AND _period_end;

    ELSIF _norm_pay_type = 'percentage' THEN
      INSERT INTO public.driver_settlement_items (org_id, settlement_id, item_type, load_id, description, amount)
      SELECT _org, _settlement.id, 'load_pay', l.id,
        'Load #' || COALESCE(l.landstar_load_id, substring(l.id::text,1,8)) || ' ' || COALESCE(l.origin,'') || ' -> ' || COALESCE(l.destination,''),
        COALESCE(l.rate,0) * _truck_pct * COALESCE(_driver.pay_rate,0) / 100.0
      FROM public.fleet_loads l
      WHERE l.org_id = _org AND l.driver_id = _driver.id
        AND l.status = 'delivered'
        AND l.delivery_date BETWEEN _ps AND _period_end;
    END IF;

    SELECT COALESCE(SUM(gross_pay),0),
           COALESCE(SUM(reimbursements),0),
           COALESCE(SUM(deductions),0),
           COALESCE(SUM(net_pay),0)
    INTO _ytd_gross, _ytd_reimb, _ytd_ded, _ytd_net
    FROM public.driver_settlements
    WHERE org_id = _org AND driver_id = _driver.id
      AND period_end >= _year_start AND period_end <= _period_end;

    UPDATE public.driver_settlements
    SET ytd_gross = _ytd_gross,
        ytd_reimbursements = _ytd_reimb,
        ytd_deductions = _ytd_ded,
        ytd_net = _ytd_net
    WHERE id = _settlement.id
    RETURNING * INTO _settlement;

    RETURN NEXT _settlement;
  END LOOP;
  RETURN;
END;
$function$;

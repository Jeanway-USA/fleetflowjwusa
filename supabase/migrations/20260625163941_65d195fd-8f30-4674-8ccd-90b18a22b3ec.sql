
-- 1. Drop dependent generated column then strip unused money columns
ALTER TABLE public.driver_settlements DROP COLUMN IF EXISTS net_pay;
ALTER TABLE public.driver_settlements DROP COLUMN IF EXISTS fuel_advances;
ALTER TABLE public.driver_settlements DROP COLUMN IF EXISTS deductions;
ALTER TABLE public.driver_settlements DROP COLUMN IF EXISTS bonus_pay;
ALTER TABLE public.driver_settlements DROP COLUMN IF EXISTS base_pay;
ALTER TABLE public.driver_settlements DROP COLUMN IF EXISTS ytd_deductions;

-- 2. Add YTD reimbursements
ALTER TABLE public.driver_settlements
  ADD COLUMN IF NOT EXISTS ytd_reimbursements numeric NOT NULL DEFAULT 0;

-- 3. Recreate net_pay as gross + reimbursements
ALTER TABLE public.driver_settlements
  ADD COLUMN net_pay numeric GENERATED ALWAYS AS (gross_pay + reimbursements) STORED;

-- 4. Restrict item_type
ALTER TABLE public.driver_settlement_items DROP CONSTRAINT IF EXISTS driver_settlement_items_item_type_check;
DELETE FROM public.driver_settlement_items WHERE item_type NOT IN ('load_pay','reimbursement');
ALTER TABLE public.driver_settlement_items
  ADD CONSTRAINT driver_settlement_items_item_type_check
  CHECK (item_type IN ('load_pay','reimbursement'));

-- 5. Replace generation function
DROP FUNCTION IF EXISTS public.generate_driver_settlements(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.generate_driver_settlements(
  _driver_ids uuid[],
  _period_end date,
  _payment_date date
)
RETURNS SETOF public.driver_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _truck_pct numeric;
  _driver record;
  _period_start date;
  _settlement public.driver_settlements%ROWTYPE;
  _gross numeric;
  _reimb numeric;
  _ytd_gross numeric;
  _ytd_reimb numeric;
  _ytd_net numeric;
  _year_start date;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_owner(_uid) OR public.has_role(_uid, 'payroll_admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  _org := public.get_user_org_id(_uid);
  IF _org IS NULL THEN
    RAISE EXCEPTION 'No organization';
  END IF;

  IF _period_end IS NULL OR _payment_date IS NULL THEN
    RAISE EXCEPTION 'period_end and payment_date are required';
  END IF;

  -- Org truck split for percentage drivers; default 0.65
  SELECT COALESCE(
    NULLIF(regexp_replace(setting_value, '[^0-9.]', '', 'g'), '')::numeric,
    0.65
  ) INTO _truck_pct
  FROM public.company_settings
  WHERE org_id = _org AND setting_key = 'truck_percentage'
  LIMIT 1;
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

    -- Gross pay
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

    -- Reimbursements
    SELECT COALESCE(SUM(ABS(e.amount)), 0) INTO _reimb
    FROM public.expenses e
    JOIN public.fleet_loads fl ON fl.id = e.load_id
    WHERE e.org_id = _org AND fl.driver_id = _driver.id
      AND e.expense_date BETWEEN _period_start AND _period_end
      AND e.expense_type IN ('Reimbursement','Parking','Tolls','Scale','Lumper','Fuel Discount');

    IF _gross = 0 AND _reimb = 0 THEN CONTINUE; END IF;

    INSERT INTO public.driver_settlements (
      org_id, driver_id, period_start, period_end, payment_date,
      gross_pay, reimbursements, status, generated_by, generated_at,
      ytd_gross, ytd_reimbursements, ytd_net
    ) VALUES (
      _org, _driver.id, _period_start, _period_end, _payment_date,
      _gross, _reimb, 'draft', _uid, now(), 0, 0, 0
    ) RETURNING * INTO _settlement;

    -- Items: load pay
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

    -- Items: reimbursements
    INSERT INTO public.driver_settlement_items (org_id, settlement_id, item_type, expense_id, description, amount)
    SELECT _org, _settlement.id, 'reimbursement', e.id,
      e.expense_type || COALESCE(' - ' || NULLIF(e.description,''), ''),
      ABS(e.amount)
    FROM public.expenses e
    JOIN public.fleet_loads fl ON fl.id = e.load_id
    WHERE e.org_id = _org AND fl.driver_id = _driver.id
      AND e.expense_date BETWEEN _period_start AND _period_end
      AND e.expense_type IN ('Reimbursement','Parking','Tolls','Scale','Lumper','Fuel Discount');

    -- YTD recompute
    SELECT
      COALESCE(SUM(gross_pay), 0),
      COALESCE(SUM(reimbursements), 0),
      COALESCE(SUM(net_pay), 0)
    INTO _ytd_gross, _ytd_reimb, _ytd_net
    FROM public.driver_settlements
    WHERE org_id = _org AND driver_id = _driver.id
      AND period_end >= _year_start AND period_end <= _period_end;

    UPDATE public.driver_settlements
    SET ytd_gross = _ytd_gross,
        ytd_reimbursements = _ytd_reimb,
        ytd_net = _ytd_net
    WHERE id = _settlement.id
    RETURNING * INTO _settlement;

    RETURN NEXT _settlement;
  END LOOP;

  RETURN;
END;
$$;

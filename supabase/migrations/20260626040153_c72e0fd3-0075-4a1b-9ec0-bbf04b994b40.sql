-- Additive columns
ALTER TABLE public.driver_settlement_items
  ADD COLUMN IF NOT EXISTS is_escrow boolean NOT NULL DEFAULT false;

ALTER TABLE public.driver_settlements
  ADD COLUMN IF NOT EXISTS tax_withholding numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escrow_credited_amount numeric NOT NULL DEFAULT 0;

-- Recreate net_pay generated column to include tax_withholding
ALTER TABLE public.driver_settlements DROP COLUMN IF EXISTS net_pay;
ALTER TABLE public.driver_settlements
  ADD COLUMN net_pay numeric
  GENERATED ALWAYS AS (gross_pay + reimbursements - deductions - tax_withholding) STORED;

-- Rewrite recalc to branch on employment_type and mirror escrow idempotently
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
  _gross numeric;
  _reimb numeric;
  _ded numeric;
  _escrow_new numeric;
  _escrow_delta numeric;
  _withhold_rate numeric;
  _withhold numeric;
  _emp public.employment_type_enum;
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

  -- Driver employment type
  SELECT employment_type INTO _emp FROM public.drivers WHERE id = _s.driver_id;
  IF _emp IS NULL THEN _emp := 'w2_company'; END IF;

  -- Sum line items by type
  SELECT COALESCE(SUM(amount), 0) INTO _gross
  FROM public.driver_settlement_items
  WHERE settlement_id = _settlement_id AND item_type IN ('load_pay', 'accessorial');

  SELECT COALESCE(SUM(amount), 0) INTO _reimb
  FROM public.driver_settlement_items
  WHERE settlement_id = _settlement_id AND item_type = 'reimbursement';

  SELECT COALESCE(SUM(amount), 0) INTO _ded
  FROM public.driver_settlement_items
  WHERE settlement_id = _settlement_id AND item_type = 'deduction';

  -- W-2 withholding (configurable; default 22%)
  IF _emp = 'w2_company' THEN
    SELECT COALESCE(NULLIF(regexp_replace(setting_value, '[^0-9.]', '', 'g'), '')::numeric, 0.22)
    INTO _withhold_rate
    FROM public.company_settings
    WHERE org_id = _org AND setting_key = 'w2_withholding_rate' LIMIT 1;
    IF _withhold_rate IS NULL THEN _withhold_rate := 0.22;
    ELSIF _withhold_rate > 1 THEN _withhold_rate := _withhold_rate / 100.0;
    END IF;
    _withhold := round(_gross * _withhold_rate, 2);
  ELSE
    _withhold := 0;
  END IF;

  UPDATE public.driver_settlements
  SET gross_pay = _gross,
      reimbursements = _reimb,
      deductions = _ded,
      tax_withholding = _withhold,
      updated_at = now()
  WHERE id = _settlement_id;

  -- Escrow mirror for lease_purchase drivers (idempotent delta)
  IF _emp = 'lease_purchase' THEN
    SELECT COALESCE(SUM(amount), 0) INTO _escrow_new
    FROM public.driver_settlement_items
    WHERE settlement_id = _settlement_id
      AND item_type = 'deduction'
      AND is_escrow = true;

    _escrow_delta := _escrow_new - COALESCE(_s.escrow_credited_amount, 0);
    IF _escrow_delta <> 0 THEN
      UPDATE public.lease_purchase_agreements
        SET current_escrow_balance = current_escrow_balance + _escrow_delta,
            updated_at = now()
        WHERE driver_id = _s.driver_id
          AND org_id    = _org
          AND status    = 'active';

      UPDATE public.driver_settlements
        SET escrow_credited_amount = _escrow_new
        WHERE id = _settlement_id;
    END IF;
  END IF;

  -- YTD recompute
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

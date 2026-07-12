
CREATE TABLE public.safety_bonus_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  safe_miles integer NOT NULL DEFAULT 0,
  earned_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  paid_in_settlement_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, period_start),
  CHECK (status IN ('pending','approved','paid','void'))
);

CREATE INDEX idx_safety_bonus_payouts_org_period ON public.safety_bonus_payouts(org_id, period_start);
CREATE INDEX idx_safety_bonus_payouts_driver ON public.safety_bonus_payouts(driver_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_bonus_payouts TO authenticated;
GRANT ALL ON public.safety_bonus_payouts TO service_role;

ALTER TABLE public.safety_bonus_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner payroll can manage safety bonus payouts"
  ON public.safety_bonus_payouts FOR ALL TO authenticated
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can view safety bonus payouts"
  ON public.safety_bonus_payouts FOR SELECT TO authenticated
  USING (has_admin_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their own safety bonus payouts"
  ON public.safety_bonus_payouts FOR SELECT TO authenticated
  USING (driver_id = get_driver_id_for_user(auth.uid()));

CREATE TRIGGER update_safety_bonus_payouts_updated_at
  BEFORE UPDATE ON public.safety_bonus_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE OR REPLACE FUNCTION public.generate_safety_bonus_payouts(_period_start date)
RETURNS TABLE (driver_id uuid, safe_miles integer, earned_amount numeric, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid := auth.uid();
  v_period_end date;
  v_settings record;
  v_driver record;
  v_tier record;
  v_miles integer;
  v_earned numeric;
  v_remaining numeric;
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

  -- Normalize to first day of month
  _period_start := date_trunc('month', _period_start)::date;
  v_period_end := (date_trunc('month', _period_start) + interval '1 month - 1 day')::date;

  SELECT * INTO v_settings FROM public.safety_bonus_settings WHERE org_id = v_org_id LIMIT 1;
  IF v_settings IS NULL THEN RAISE EXCEPTION 'Safety bonus not configured'; END IF;

  FOR v_driver IN
    SELECT id FROM public.drivers WHERE org_id = v_org_id AND status = 'active'
  LOOP
    -- Safe miles for the month (delivered loads)
    SELECT COALESCE(SUM(COALESCE(actual_miles, booked_miles, 0)), 0)::integer
      INTO v_miles
      FROM public.fleet_loads
     WHERE driver_id = v_driver.id
       AND status = 'delivered'
       AND delivery_date >= _period_start
       AND delivery_date <= v_period_end;

    v_ineligible := false;
    v_reason := NULL;

    IF v_settings.requires_zero_accidents THEN
      IF EXISTS (
        SELECT 1 FROM public.incidents
         WHERE driver_id = v_driver.id
           AND incident_type = 'accident'
           AND COALESCE(LOWER(severity), '') <> 'minor'
           AND incident_date >= _period_start AND incident_date <= v_period_end
      ) THEN v_ineligible := true; v_reason := 'Accident in period'; END IF;
    END IF;

    IF NOT v_ineligible AND v_settings.requires_zero_csa_points THEN
      IF EXISTS (
        SELECT 1 FROM public.incidents
         WHERE driver_id = v_driver.id
           AND citation_issued = true
           AND incident_date >= _period_start AND incident_date <= v_period_end
      ) THEN v_ineligible := true; v_reason := 'CSA citation in period'; END IF;
    END IF;

    IF NOT v_ineligible AND v_settings.requires_zero_service_failures THEN
      IF EXISTS (
        SELECT 1 FROM public.fleet_loads
         WHERE driver_id = v_driver.id
           AND status IN ('late','service_failure')
           AND delivery_date >= _period_start AND delivery_date <= v_period_end
      ) THEN v_ineligible := true; v_reason := 'Service failure in period'; END IF;
    END IF;

    v_earned := 0;
    IF NOT v_ineligible AND v_miles > 0 THEN
      FOR v_tier IN
        SELECT min_miles, max_miles, rate_per_mile
          FROM public.safety_bonus_tiers
         WHERE setting_id = v_settings.id
         ORDER BY min_miles ASC
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

    INSERT INTO public.safety_bonus_payouts
      (org_id, driver_id, period_start, period_end, safe_miles, earned_amount, status, notes, created_by)
    VALUES
      (v_org_id, v_driver.id, _period_start, v_period_end, v_miles, ROUND(v_earned, 2), v_status, v_reason, v_user_id)
    ON CONFLICT (driver_id, period_start) DO UPDATE
      SET safe_miles = EXCLUDED.safe_miles,
          earned_amount = EXCLUDED.earned_amount,
          status = CASE
                     WHEN public.safety_bonus_payouts.status IN ('paid','approved')
                     THEN public.safety_bonus_payouts.status
                     ELSE EXCLUDED.status
                   END,
          notes = EXCLUDED.notes,
          updated_at = now();

    driver_id := v_driver.id;
    safe_miles := v_miles;
    earned_amount := ROUND(v_earned, 2);
    status := v_status;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_safety_bonus_payouts(date) TO authenticated;

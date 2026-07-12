
ALTER TABLE public.internal_payroll_ledger
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS one_time_bonus numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS one_time_deduction numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.protect_finalized_payroll_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    -- Only legal transition is finalized -> voided (and stamping voided_at/voided_by).
    IF NEW.status = 'voided' AND OLD.status = 'finalized' THEN
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.gross_line_haul IS DISTINCT FROM OLD.gross_line_haul
       OR NEW.pass_through_fsc IS DISTINCT FROM OLD.pass_through_fsc
       OR NEW.gross_taxable_pay IS DISTINCT FROM OLD.gross_taxable_pay
       OR NEW.total_miles IS DISTINCT FROM OLD.total_miles
       OR NEW.federal_withholding_override IS DISTINCT FROM OLD.federal_withholding_override
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
       OR NEW.pay_model IS DISTINCT FROM OLD.pay_model
       OR NEW.base_salary IS DISTINCT FROM OLD.base_salary
       OR NEW.bonus_pay IS DISTINCT FROM OLD.bonus_pay
       OR NEW.holiday_pay IS DISTINCT FROM OLD.holiday_pay
       OR NEW.one_time_bonus IS DISTINCT FROM OLD.one_time_bonus
       OR NEW.one_time_deduction IS DISTINCT FROM OLD.one_time_deduction
    THEN
      RAISE EXCEPTION 'Finalized payroll ledger rows are locked for audit integrity'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'Finalized payroll ledger rows cannot be deleted; void instead'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

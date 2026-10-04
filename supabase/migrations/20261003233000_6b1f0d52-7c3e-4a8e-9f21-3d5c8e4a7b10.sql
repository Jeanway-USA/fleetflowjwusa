-- Truck loan payments: post installments from the database instead of an HTTP cron.
--
-- The previous pg_cron job called the post-truck-loan-payments edge function
-- without the x-cron-secret header, so every run was rejected (401) and no
-- payment was posted after June 2026. It also posted on the 1st, while JeanWay's
-- installments fall on the loan's start day (the 5th).
--
-- post_due_truck_loan_payments() posts every installment that has come due
-- (loan_start_date + N months, N = 1..term) and is not yet in the ledger for that
-- month. It is idempotent, catches up missed months on its own, and stops once the
-- balance is paid off. The existing trigger on truck_loan_payments lowers
-- trucks.loan_balance for each row inserted.

CREATE OR REPLACE FUNCTION public.post_due_truck_loan_payments(
  p_truck_id uuid DEFAULT NULL,
  p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE (truck_id uuid, unit_number text, payment_date date, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_org uuid;
  t record;
  n integer;
  v_due date;
  v_amount numeric;
  v_balance numeric;
BEGIN
  -- Signed-in callers (the "Post Now" button) must be org admins and only touch
  -- their own org. pg_cron runs with no auth.uid() and covers every org.
  IF v_caller IS NOT NULL THEN
    IF NOT public.has_admin_access(v_caller) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    v_org := public.get_user_org_id(v_caller);
  END IF;

  FOR t IN
    SELECT tr.id, tr.org_id, tr.unit_number, tr.monthly_payment, tr.loan_start_date,
           tr.loan_term_months, tr.loan_balance
    FROM public.trucks tr
    WHERE tr.deleted_at IS NULL
      AND tr.status IS DISTINCT FROM 'out_of_service'
      AND tr.monthly_payment > 0
      AND tr.loan_start_date IS NOT NULL
      AND (p_truck_id IS NULL OR tr.id = p_truck_id)
      AND (v_org IS NULL OR tr.org_id = v_org)
  LOOP
    v_balance := t.loan_balance;
    FOR n IN 1..COALESCE(t.loan_term_months, 360) LOOP
      -- Postgres clamps to month end (e.g. Jan 31 + 1 month = Feb 28).
      v_due := (t.loan_start_date + make_interval(months => n))::date;
      EXIT WHEN v_due > p_today;
      EXIT WHEN v_balance IS NOT NULL AND v_balance <= 0;

      IF NOT EXISTS (
        SELECT 1 FROM public.truck_loan_payments p
        WHERE p.truck_id = t.id
          AND p.payment_date >= date_trunc('month', v_due)::date
          AND p.payment_date < (date_trunc('month', v_due) + interval '1 month')::date
      ) THEN
        v_amount := CASE WHEN v_balance IS NULL THEN t.monthly_payment
                         ELSE LEAST(t.monthly_payment, v_balance) END;
        INSERT INTO public.truck_loan_payments (org_id, truck_id, payment_date, amount, note)
        VALUES (t.org_id, t.id, v_due, v_amount, 'Auto: ' || to_char(v_due, 'MonYY') || ' installment');
        IF v_balance IS NOT NULL THEN
          v_balance := v_balance - v_amount;
        END IF;
        truck_id := t.id;
        unit_number := t.unit_number;
        payment_date := v_due;
        amount := v_amount;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.post_due_truck_loan_payments(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_due_truck_loan_payments(uuid, date) TO authenticated, service_role;

-- Replace the broken monthly HTTP job with a daily in-database run.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'post-truck-loan-payments-monthly';
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'post-truck-loan-payments-daily';
END $$;

SELECT cron.schedule(
  'post-truck-loan-payments-daily',
  '0 12 * * *',
  $$SELECT public.post_due_truck_loan_payments();$$
);

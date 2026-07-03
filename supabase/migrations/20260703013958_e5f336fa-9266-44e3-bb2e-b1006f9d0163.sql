
-- 1. Add original_loan_amount column and backfill
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS original_loan_amount numeric;

UPDATE public.trucks
   SET original_loan_amount = loan_balance
 WHERE original_loan_amount IS NULL
   AND loan_balance IS NOT NULL;

-- 2. Payments ledger table
CREATE TABLE IF NOT EXISTS public.truck_loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS truck_loan_payments_truck_idx
  ON public.truck_loan_payments (truck_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS truck_loan_payments_org_idx
  ON public.truck_loan_payments (org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.truck_loan_payments TO authenticated;
GRANT ALL ON public.truck_loan_payments TO service_role;

ALTER TABLE public.truck_loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view org loan payments"
  ON public.truck_loan_payments FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_admin_access(auth.uid()));

CREATE POLICY "Admins can insert loan payments"
  ON public.truck_loan_payments FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_admin_access(auth.uid()));

CREATE POLICY "Admins can update loan payments"
  ON public.truck_loan_payments FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_admin_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_admin_access(auth.uid()));

CREATE POLICY "Admins can delete loan payments"
  ON public.truck_loan_payments FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_admin_access(auth.uid()));

-- 3. Defaults trigger (org_id, created_by)
CREATE OR REPLACE FUNCTION public.set_truck_loan_payment_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_truck_loan_payment_defaults ON public.truck_loan_payments;
CREATE TRIGGER trg_truck_loan_payment_defaults
  BEFORE INSERT ON public.truck_loan_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_truck_loan_payment_defaults();

-- 4. Balance sync trigger
CREATE OR REPLACE FUNCTION public.apply_truck_loan_payment_to_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.trucks
       SET loan_balance = COALESCE(loan_balance, 0) - NEW.amount,
           updated_at = now()
     WHERE id = NEW.truck_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.truck_id IS DISTINCT FROM OLD.truck_id THEN
      -- reverse old
      UPDATE public.trucks
         SET loan_balance = COALESCE(loan_balance, 0) + OLD.amount,
             updated_at = now()
       WHERE id = OLD.truck_id;
      -- apply new
      UPDATE public.trucks
         SET loan_balance = COALESCE(loan_balance, 0) - NEW.amount,
             updated_at = now()
       WHERE id = NEW.truck_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.trucks
       SET loan_balance = COALESCE(loan_balance, 0) + OLD.amount,
           updated_at = now()
     WHERE id = OLD.truck_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_truck_loan_payment ON public.truck_loan_payments;
CREATE TRIGGER trg_apply_truck_loan_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.truck_loan_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_truck_loan_payment_to_balance();

-- 5. updated_at trigger
DROP TRIGGER IF EXISTS trg_truck_loan_payments_updated_at ON public.truck_loan_payments;
CREATE TRIGGER trg_truck_loan_payments_updated_at
  BEFORE UPDATE ON public.truck_loan_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

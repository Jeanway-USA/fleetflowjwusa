ALTER TABLE public.trucks
  ADD COLUMN loan_balance numeric DEFAULT NULL,
  ADD COLUMN monthly_payment numeric DEFAULT NULL,
  ADD COLUMN interest_rate numeric DEFAULT NULL,
  ADD COLUMN loan_term_months integer DEFAULT NULL,
  ADD COLUMN loan_start_date date DEFAULT NULL,
  ADD COLUMN lender_name text DEFAULT NULL;
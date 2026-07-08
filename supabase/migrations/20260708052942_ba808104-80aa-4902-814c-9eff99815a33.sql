
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS base_salary_per_period numeric NOT NULL DEFAULT 0;

ALTER TABLE public.internal_payroll_ledger
  ADD COLUMN IF NOT EXISTS base_salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_pay numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holiday_pay numeric NOT NULL DEFAULT 0;

ALTER TABLE public.tax_filing_completions
  ADD COLUMN IF NOT EXISTS is_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exempt_reason text,
  ALTER COLUMN confirmation_reference DROP NOT NULL,
  ALTER COLUMN filed_on DROP NOT NULL;

ALTER TABLE public.tax_filing_completions
  DROP CONSTRAINT IF EXISTS tax_filing_completions_exempt_or_filed;

ALTER TABLE public.tax_filing_completions
  ADD CONSTRAINT tax_filing_completions_exempt_or_filed
  CHECK (
    is_exempt = true
    OR (confirmation_reference IS NOT NULL AND filed_on IS NOT NULL)
  );

UPDATE public.drivers
SET base_salary_per_period = 2000
WHERE lower(first_name) = 'timothy'
  AND lower(last_name) = 'ames'
  AND base_salary_per_period = 0;

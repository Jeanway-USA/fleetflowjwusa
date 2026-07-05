ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS down_payment numeric,
  ADD COLUMN IF NOT EXISTS financing_fees numeric;

ALTER TABLE public.agency_loads
  ADD COLUMN IF NOT EXISTS gross_linehaul numeric,
  ADD COLUMN IF NOT EXISTS fuel_surcharge numeric,
  ADD COLUMN IF NOT EXISTS tarp_fee numeric,
  ADD COLUMN IF NOT EXISTS bco_split_pct numeric NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS exception_status text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS pay2day boolean NOT NULL DEFAULT false;

ALTER TABLE public.agency_loads
  DROP CONSTRAINT IF EXISTS agency_loads_exception_status_check;
ALTER TABLE public.agency_loads
  ADD CONSTRAINT agency_loads_exception_status_check
  CHECK (exception_status IN ('normal','disrupted','pending_update'));

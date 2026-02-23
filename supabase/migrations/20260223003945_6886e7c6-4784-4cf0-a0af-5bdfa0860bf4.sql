
-- Enforce NOT NULL on org_id for all 7 core tables
ALTER TABLE public.fleet_loads ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.agency_loads ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.drivers ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.trucks ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.driver_payroll ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.expenses ALTER COLUMN org_id SET NOT NULL;

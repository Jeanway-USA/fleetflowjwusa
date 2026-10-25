-- Engine model and transmission on each truck (Oct 2026). Run once through Lovable. Safe to run again.
-- The new-job and log-work windows use these, with the make and engine, to offer the right services for each truck.
ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS engine_model text;
ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS transmission text;

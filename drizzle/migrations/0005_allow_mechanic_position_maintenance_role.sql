-- Let a position carry the maintenance role, and give the built-in Mechanic position that role.
-- Additive: only widens the allowed values and fills the Mechanic position where no role was chosen.

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.positions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%default_role%'
  LOOP
    EXECUTE format('ALTER TABLE public.positions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.positions
  ADD CONSTRAINT positions_default_role_check
  CHECK (default_role IS NULL OR default_role IN ('owner', 'payroll_admin', 'dispatcher', 'safety', 'driver', 'maintenance'));

UPDATE public.positions
SET default_role = 'maintenance'
WHERE key = 'mechanic' AND is_builtin AND default_role IS NULL;

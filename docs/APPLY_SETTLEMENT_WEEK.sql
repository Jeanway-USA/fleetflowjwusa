-- Settlement week end day (Nov 2026). Run once through Lovable. Safe to run again.
-- The weekly settlement period used to be fixed at Thursday to Wednesday, because Landstar settles on Wednesday. This adds a
-- setting so a company whose settlement week ends on another day can change it (Settings, Company, "Settlement week ends on").
--
-- 0 = Sunday ... 6 = Saturday. The default is 3 (Wednesday), the Landstar week, and every existing company gets it, so nothing
-- changes until someone picks another day. Saved settlements, statements and loads are not touched: the setting only decides
-- how weeks are drawn and which week a date belongs to from now on.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS settlement_week_end_day smallint NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_settlement_week_end_day_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_settlement_week_end_day_check CHECK (settlement_week_end_day BETWEEN 0 AND 6);
  END IF;
END $$;

COMMENT ON COLUMN public.organizations.settlement_week_end_day IS
  'Day the weekly settlement period ends on: 0 = Sunday ... 6 = Saturday. Default 3 = Wednesday (the Landstar week, Thursday to Wednesday).';

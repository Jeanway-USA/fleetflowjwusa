-- Company date format (Nov 2026). Run once through Lovable. Safe to run again.
-- Settings, Company has a Date Format choice (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD) that is now saved on the company. It is stored as the
-- date pattern itself, so the app can use it directly. Every existing company gets MM/dd/yyyy, the US style the app has always shown,
-- so nothing changes until someone picks another format. The time zone already has its own column (company_timezone, default
-- America/Chicago) and needs nothing here.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'MM/dd/yyyy';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_date_format_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_date_format_check CHECK (date_format IN ('MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'));
  END IF;
END $$;

COMMENT ON COLUMN public.organizations.date_format IS
  'How dates are written in lists, settlements and reports: MM/dd/yyyy (default, US), dd/MM/yyyy or yyyy-MM-dd. A date-fns pattern.';

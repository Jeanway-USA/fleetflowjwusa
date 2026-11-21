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

  'Day the weekly settlement period ends on: 0 = Sunday ... 6 = Saturday. Default 3 = Wednesday (the Landstar week, Thursday to Wednesday).'
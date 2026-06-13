
-- 1. Schema additions (idempotent)
ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS pickup_at   timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_tz   text,
  ADD COLUMN IF NOT EXISTS delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_tz text;

ALTER TABLE public.agency_loads
  ADD COLUMN IF NOT EXISTS pickup_at   timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_tz   text,
  ADD COLUMN IF NOT EXISTS delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_tz text;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS company_timezone text NOT NULL DEFAULT 'America/Chicago';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS time_display_pref text NOT NULL DEFAULT 'company';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_time_display_pref_chk') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_time_display_pref_chk
      CHECK (time_display_pref IN ('company', 'local'));
  END IF;
END $$;

-- 2. State-abbrev → IANA helper
CREATE OR REPLACE FUNCTION public.state_to_iana(_location text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE st text;
BEGIN
  IF _location IS NULL THEN RETURN NULL; END IF;
  st := upper(left(btrim(split_part(_location, ',', array_length(string_to_array(_location, ','), 1))), 2));
  RETURN CASE st
    WHEN 'AL' THEN 'America/Chicago' WHEN 'AK' THEN 'America/Anchorage'
    WHEN 'AZ' THEN 'America/Phoenix' WHEN 'AR' THEN 'America/Chicago'
    WHEN 'CA' THEN 'America/Los_Angeles' WHEN 'CO' THEN 'America/Denver'
    WHEN 'CT' THEN 'America/New_York' WHEN 'DE' THEN 'America/New_York'
    WHEN 'DC' THEN 'America/New_York' WHEN 'FL' THEN 'America/New_York'
    WHEN 'GA' THEN 'America/New_York' WHEN 'HI' THEN 'Pacific/Honolulu'
    WHEN 'ID' THEN 'America/Boise'   WHEN 'IL' THEN 'America/Chicago'
    WHEN 'IN' THEN 'America/Indiana/Indianapolis' WHEN 'IA' THEN 'America/Chicago'
    WHEN 'KS' THEN 'America/Chicago' WHEN 'KY' THEN 'America/New_York'
    WHEN 'LA' THEN 'America/Chicago' WHEN 'ME' THEN 'America/New_York'
    WHEN 'MD' THEN 'America/New_York' WHEN 'MA' THEN 'America/New_York'
    WHEN 'MI' THEN 'America/Detroit'  WHEN 'MN' THEN 'America/Chicago'
    WHEN 'MS' THEN 'America/Chicago' WHEN 'MO' THEN 'America/Chicago'
    WHEN 'MT' THEN 'America/Denver'  WHEN 'NE' THEN 'America/Chicago'
    WHEN 'NV' THEN 'America/Los_Angeles' WHEN 'NH' THEN 'America/New_York'
    WHEN 'NJ' THEN 'America/New_York' WHEN 'NM' THEN 'America/Denver'
    WHEN 'NY' THEN 'America/New_York' WHEN 'NC' THEN 'America/New_York'
    WHEN 'ND' THEN 'America/Chicago' WHEN 'OH' THEN 'America/New_York'
    WHEN 'OK' THEN 'America/Chicago' WHEN 'OR' THEN 'America/Los_Angeles'
    WHEN 'PA' THEN 'America/New_York' WHEN 'RI' THEN 'America/New_York'
    WHEN 'SC' THEN 'America/New_York' WHEN 'SD' THEN 'America/Chicago'
    WHEN 'TN' THEN 'America/Chicago' WHEN 'TX' THEN 'America/Chicago'
    WHEN 'UT' THEN 'America/Denver'  WHEN 'VT' THEN 'America/New_York'
    WHEN 'VA' THEN 'America/New_York' WHEN 'WA' THEN 'America/Los_Angeles'
    WHEN 'WV' THEN 'America/New_York' WHEN 'WI' THEN 'America/Chicago'
    WHEN 'WY' THEN 'America/Denver'
    WHEN 'ON' THEN 'America/Toronto' WHEN 'QC' THEN 'America/Toronto'
    WHEN 'BC' THEN 'America/Vancouver' WHEN 'AB' THEN 'America/Edmonton'
    WHEN 'MB' THEN 'America/Winnipeg' WHEN 'SK' THEN 'America/Regina'
    ELSE NULL
  END;
END;
$$;

-- 3. Tolerant legacy-time parser → returns HH24:MI text, defaults '00:00'
CREATE OR REPLACE FUNCTION public.parse_legacy_time(_t text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
  m text[];
  h int;
  mi int;
  is_pm boolean;
  is_am boolean;
BEGIN
  IF _t IS NULL THEN RETURN '00:00'; END IF;
  s := upper(btrim(_t));
  IF s = '' THEN RETURN '00:00'; END IF;

  is_pm := position('PM' in s) > 0;
  is_am := position('AM' in s) > 0;

  -- Strip everything except digits and the first ':'
  m := regexp_matches(s, '(\d{1,2})\s*[:.\s]?\s*(\d{2})?');
  IF m IS NULL THEN RETURN '00:00'; END IF;

  h := m[1]::int;
  mi := COALESCE(NULLIF(m[2], '')::int, 0);

  IF is_pm AND h < 12 THEN h := h + 12; END IF;
  IF is_am AND h = 12 THEN h := 0; END IF;

  IF h < 0 OR h > 23 OR mi < 0 OR mi > 59 THEN RETURN '00:00'; END IF;
  RETURN lpad(h::text, 2, '0') || ':' || lpad(mi::text, 2, '0');
EXCEPTION WHEN OTHERS THEN
  RETURN '00:00';
END;
$$;

-- 4. Backfill timezones first (always safe)
UPDATE public.fleet_loads fl
SET
  pickup_tz = COALESCE(pickup_tz,
    public.state_to_iana(fl.origin),
    (SELECT o.company_timezone FROM public.organizations o WHERE o.id = fl.org_id),
    'America/Chicago'),
  delivery_tz = COALESCE(delivery_tz,
    public.state_to_iana(fl.destination),
    (SELECT o.company_timezone FROM public.organizations o WHERE o.id = fl.org_id),
    'America/Chicago')
WHERE pickup_tz IS NULL OR delivery_tz IS NULL;

UPDATE public.agency_loads al
SET
  pickup_tz = COALESCE(pickup_tz,
    public.state_to_iana(al.origin),
    (SELECT o.company_timezone FROM public.organizations o WHERE o.id = al.org_id),
    'America/Chicago'),
  delivery_tz = COALESCE(delivery_tz,
    public.state_to_iana(al.destination),
    (SELECT o.company_timezone FROM public.organizations o WHERE o.id = al.org_id),
    'America/Chicago')
WHERE pickup_tz IS NULL OR delivery_tz IS NULL;

-- 5. Backfill UTC instants using the tolerant parser
UPDATE public.fleet_loads fl
SET pickup_at = (
  (fl.pickup_date::text || ' ' || public.parse_legacy_time(fl.pickup_time))::timestamp
  AT TIME ZONE fl.pickup_tz
)
WHERE fl.pickup_date IS NOT NULL AND fl.pickup_at IS NULL AND fl.pickup_tz IS NOT NULL;

UPDATE public.fleet_loads fl
SET delivery_at = (
  (fl.delivery_date::text || ' ' || public.parse_legacy_time(fl.delivery_time))::timestamp
  AT TIME ZONE fl.delivery_tz
)
WHERE fl.delivery_date IS NOT NULL AND fl.delivery_at IS NULL AND fl.delivery_tz IS NOT NULL;

UPDATE public.agency_loads al
SET pickup_at = ((al.pickup_date::text || ' 00:00')::timestamp AT TIME ZONE al.pickup_tz)
WHERE al.pickup_date IS NOT NULL AND al.pickup_at IS NULL AND al.pickup_tz IS NOT NULL;

UPDATE public.agency_loads al
SET delivery_at = ((al.delivery_date::text || ' 00:00')::timestamp AT TIME ZONE al.delivery_tz)
WHERE al.delivery_date IS NOT NULL AND al.delivery_at IS NULL AND al.delivery_tz IS NOT NULL;


-- Backfill state_tax_configurations with real 2026 SUTA + SIT values.
-- Preserves admin-edited rows by only updating rows still at the default
-- (suta_rate = 0 AND sit_rate = 0 AND has_state_income_tax = false).

CREATE OR REPLACE FUNCTION public.seed_state_tax_configurations(_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.state_tax_configurations
    (org_id, state_code, suta_rate, suta_wage_base, has_state_income_tax, sit_rate)
  VALUES
    (_org_id, 'AL', 0.0270,  8000, true,  0.0400),
    (_org_id, 'AK', 0.0100, 49700, false, 0.0000),
    (_org_id, 'AZ', 0.0200,  8000, true,  0.0250),
    (_org_id, 'AR', 0.0195, 7000,  true,  0.0390),
    (_org_id, 'CA', 0.0340,  7000, true,  0.0600),
    (_org_id, 'CO', 0.0170, 27200, true,  0.0440),
    (_org_id, 'CT', 0.0250, 26100, true,  0.0500),
    (_org_id, 'DE', 0.0130, 12500, true,  0.0520),
    (_org_id, 'DC', 0.0270,  9000, true,  0.0650),
    (_org_id, 'FL', 0.0270,  7000, false, 0.0000),
    (_org_id, 'GA', 0.0264,  9500, true,  0.0539),
    (_org_id, 'HI', 0.0400, 62000, true,  0.0700),
    (_org_id, 'ID', 0.0097, 55300, true,  0.05695),
    (_org_id, 'IL', 0.0395, 13916, true,  0.0495),
    (_org_id, 'IN', 0.0250,  9500, true,  0.0300),
    (_org_id, 'IA', 0.0100, 39500, true,  0.0380),
    (_org_id, 'KS', 0.0260, 14000, true,  0.0525),
    (_org_id, 'KY', 0.0270, 11700, true,  0.0400),
    (_org_id, 'LA', 0.0113,  7700, true,  0.0300),
    (_org_id, 'ME', 0.0206, 12000, true,  0.0675),
    (_org_id, 'MD', 0.0260,  8500, true,  0.0475),
    (_org_id, 'MA', 0.0187, 15000, true,  0.0500),
    (_org_id, 'MI', 0.0270,  9500, true,  0.0425),
    (_org_id, 'MN', 0.0110, 43000, true,  0.0680),
    (_org_id, 'MS', 0.0110, 14000, true,  0.0470),
    (_org_id, 'MO', 0.0227, 10000, true,  0.0470),
    (_org_id, 'MT', 0.0130, 45100, true,  0.0500),
    (_org_id, 'NE', 0.0125,  9000, true,  0.0520),
    (_org_id, 'NV', 0.0295, 41800, false, 0.0000),
    (_org_id, 'NH', 0.0270, 14000, false, 0.0000),
    (_org_id, 'NJ', 0.0280, 43300, true,  0.05525),
    (_org_id, 'NM', 0.0100, 33200, true,  0.0490),
    (_org_id, 'NY', 0.04025,12800, true,  0.0600),
    (_org_id, 'NC', 0.0100, 32600, true,  0.0425),
    (_org_id, 'ND', 0.0102, 45100, true,  0.0204),
    (_org_id, 'OH', 0.0270,  9000, true,  0.0350),
    (_org_id, 'OK', 0.0150, 28200, true,  0.0475),
    (_org_id, 'OR', 0.0240, 54300, true,  0.0875),
    (_org_id, 'PA', 0.03822,10000, true,  0.0307),
    (_org_id, 'RI', 0.0098, 29800, true,  0.0475),
    (_org_id, 'SC', 0.0041, 14000, true,  0.0620),
    (_org_id, 'SD', 0.0120, 15000, false, 0.0000),
    (_org_id, 'TN', 0.0270,  7000, false, 0.0000),
    (_org_id, 'TX', 0.0270,  9000, false, 0.0000),
    (_org_id, 'UT', 0.0140, 48900, true,  0.0455),
    (_org_id, 'VT', 0.0100, 14800, true,  0.0660),
    (_org_id, 'VA', 0.0250,  8000, true,  0.0575),
    (_org_id, 'WA', 0.0090, 72800, false, 0.0000),
    (_org_id, 'WV', 0.0270,  9500, true,  0.0512),
    (_org_id, 'WI', 0.0305, 14000, true,  0.0530),
    (_org_id, 'WY', 0.0118, 32400, false, 0.0000)
  ON CONFLICT (org_id, state_code) DO UPDATE
    SET suta_rate            = EXCLUDED.suta_rate,
        suta_wage_base       = EXCLUDED.suta_wage_base,
        has_state_income_tax = EXCLUDED.has_state_income_tax,
        sit_rate             = EXCLUDED.sit_rate,
        updated_at           = now()
    WHERE state_tax_configurations.suta_rate = 0
      AND state_tax_configurations.sit_rate = 0
      AND state_tax_configurations.has_state_income_tax = false;
END;
$$;

-- Backfill every existing org that already has (default) rows.
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN
    SELECT DISTINCT org_id FROM public.state_tax_configurations
  LOOP
    PERFORM public.seed_state_tax_configurations(org.org_id);
  END LOOP;
END;
$$;

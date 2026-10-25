ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS engine_make text;
ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS duty_cycle text NOT NULL DEFAULT 'normal';
ALTER TABLE public.trucks DROP CONSTRAINT IF EXISTS trucks_duty_cycle_check;
ALTER TABLE public.trucks ADD CONSTRAINT trucks_duty_cycle_check CHECK (duty_cycle IN ('normal', 'heavy', 'severe'));

UPDATE public.manufacturer_pm_profiles
SET interval_miles = 60000,
    description = 'Engine oil, oil filter, fuel filters, belt inspection. Maker chart: 60,000 mi normal duty, 45,000 heavy, 35,000 severe; one step shorter if idle time is over 30%.'
WHERE manufacturer IN ('Volvo', 'Mack') AND service_code = 'PM_B';

INSERT INTO public.manufacturer_pm_profiles (manufacturer, service_code, service_name, interval_miles, interval_days, description, display_order)
SELECT m.manufacturer, s.service_code, s.service_name,
       CASE WHEN m.manufacturer IN ('Volvo', 'Mack') AND s.service_code = 'DPF_CLEAN' THEN 250000 ELSE s.interval_miles END,
       s.interval_days, s.description, s.display_order
FROM (VALUES ('Freightliner'), ('Western Star'), ('Peterbilt'), ('Kenworth'), ('International'), ('Volvo'), ('Mack')) AS m(manufacturer)
CROSS JOIN (VALUES
  ('ANNUAL_DOT', 'Annual DOT inspection', NULL::int, 365, 'Federal annual inspection (49 CFR 396.17), every 12 months. Keep the report on file.', 20),
  ('AIR_DRYER', 'Air dryer cartridge', 300000, 1095, 'Replace the cartridge: 3 years or 300,000 mi on single-trailer line haul (Bendix). Sooner for heavy air use or doubles. Check for moisture in the air tanks monthly.', 21),
  ('DPF_CLEAN', 'DPF ash cleaning', 300000, NULL::int, 'Clean the diesel particulate filter. Detroit 300,000-400,000 mi; Cummins 2016+ up to 500,000; Volvo and Mack 250,000 mi or 4,500 hr. Usually triggered by a dash warning. Verify for the engine and year.', 22),
  ('DEF_FILTER', 'DEF pump filter', 300000, NULL::int, 'Replace the DEF pump filter. Cummins X15: 300,000 mi or 6,750 hr. Other makers reported 150,000-500,000 mi. Verify for the engine.', 23),
  ('COOLANT', 'Coolant test and service', 300000, 1095, 'Test the coolant and change it. Conventional about 300,000 mi, extended-life about 600,000. Verify with the coolant brand and the engine maker.', 24),
  ('TRANS_FLUID', 'Transmission fluid and filter', 500000, 1825, 'Eaton automated transmissions on approved synthetic fluid: about 500,000 mi or 5 years, line haul. Vocational use about 180,000 mi or 3 years. Change the filter with the fluid. Verify for the transmission.', 25),
  ('AXLE_FLUID', 'Drive axle fluid', 250000, 1460, 'Full synthetic gear oil: about 250,000 mi or 4 years (standard oil 100,000 mi or 1 year). Some axles with a pump and filter allow longer. Verify with the axle maker.', 26)
) AS s(service_code, service_name, interval_miles, interval_days, description, display_order)
ON CONFLICT (manufacturer, service_code) DO NOTHING;
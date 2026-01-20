-- Peterbilt profiles (PACCAR Normal Duty <20% Idle)
INSERT INTO manufacturer_pm_profiles (manufacturer, service_code, service_name, interval_miles, description, display_order)
VALUES
  ('Peterbilt', 'PM_A', 'PM A (System Check)', 37000, 'Air System, Charge Air System, Charging/Cranking System, Cooling System inspection.', 1),
  ('Peterbilt', 'PM_B', 'PM B (Oil & Filters)', 75000, 'Engine Oil, Oil Filters, Fuel Filters, Belt and Tensioner check, Drain Water from Fuel Filter.', 2),
  ('Peterbilt', 'PM_C', 'PM C (Annual)', 150000, 'Vibration Damper torque, Coolant Hoses, Engine Mount Bolts, Injector Calibration verify, Valve Clearance adjustment.', 3),
  ('Peterbilt', 'PM_DE', 'PM D/E (Major)', 300000, 'DPF Clean, DEF Filter replacement, Coolant Filter Element, Valve Clearance adjustment.', 4),
  ('Peterbilt', 'PM_G', 'PM G (Belt Service)', 450000, 'Replace Poly-V Belts.', 5);

-- Kenworth profiles (same as Peterbilt - PACCAR)
INSERT INTO manufacturer_pm_profiles (manufacturer, service_code, service_name, interval_miles, description, display_order)
VALUES
  ('Kenworth', 'PM_A', 'PM A (System Check)', 37000, 'Air System, Charge Air System, Charging/Cranking System, Cooling System inspection.', 1),
  ('Kenworth', 'PM_B', 'PM B (Oil & Filters)', 75000, 'Engine Oil, Oil Filters, Fuel Filters, Belt and Tensioner check, Drain Water from Fuel Filter.', 2),
  ('Kenworth', 'PM_C', 'PM C (Annual)', 150000, 'Vibration Damper torque, Coolant Hoses, Engine Mount Bolts, Injector Calibration verify, Valve Clearance adjustment.', 3),
  ('Kenworth', 'PM_DE', 'PM D/E (Major)', 300000, 'DPF Clean, DEF Filter replacement, Coolant Filter Element, Valve Clearance adjustment.', 4),
  ('Kenworth', 'PM_G', 'PM G (Belt Service)', 450000, 'Replace Poly-V Belts.', 5);

-- International profiles (Class A/B/C/D system)
INSERT INTO manufacturer_pm_profiles (manufacturer, service_code, service_name, interval_miles, description, display_order)
VALUES
  ('International', 'CLASS_A', 'Class A (Safety)', 10000, 'Engine oil level, coolant level, fluid leak inspection, DEF level, battery check, all lights, brake inspection.', 1),
  ('International', 'CLASS_B', 'Class B (Filters)', 20000, 'Class A items + Oil change, oil filter, fuel filters, chassis lube, brake adjustment check.', 2),
  ('International', 'CLASS_C', 'Class C (Comprehensive)', 40000, 'Class A/B items + Air filter, transmission check, cooling system inspection, steering components.', 3),
  ('International', 'CLASS_D', 'Class D (Major)', 80000, 'Full system overhaul: transmission fluid, axle fluid, coolant flush, air dryer cartridge, complete brake service.', 4);

-- Volvo profiles (VDS-4.5 Normal Duty)
INSERT INTO manufacturer_pm_profiles (manufacturer, service_code, service_name, interval_miles, description, display_order)
VALUES
  ('Volvo', 'PM_A', 'PM A (Grease & Safety)', 25000, 'Chassis lubrication, kingpins, slack adjusters, 5th wheel plate, brake inspection.', 1),
  ('Volvo', 'PM_B', 'PM B (Oil & Fuel)', 75000, 'Engine oil, oil filter, fuel filters, belt inspection, air dryer service.', 2),
  ('Volvo', 'PM_C', 'PM C (Annual)', 150000, 'Engine air filter, cabin HVAC filters, coolant hoses, vibration damper, engine mounts.', 3),
  ('Volvo', 'PM_D', 'PM D (Major Fluids)', 300000, 'DPF clean, DEF filter, coolant filter, transmission fluid, rear axle fluid.', 4),
  ('Volvo', 'PM_E', 'PM E (Coolant)', 750000, 'Complete engine coolant flush and replacement.', 5);

-- Mack profiles (EOS-4.5 Normal Duty - similar to Volvo)
INSERT INTO manufacturer_pm_profiles (manufacturer, service_code, service_name, interval_miles, description, display_order)
VALUES
  ('Mack', 'PM_A', 'PM A (Grease & Safety)', 25000, 'Chassis lubrication, kingpins, slack adjusters, 5th wheel plate, brake inspection.', 1),
  ('Mack', 'PM_B', 'PM B (Oil & Fuel)', 75000, 'Engine oil, oil filter, fuel filters, belt inspection, air dryer service.', 2),
  ('Mack', 'PM_C', 'PM C (Annual)', 150000, 'Engine air filter, cabin HVAC filters, coolant hoses, vibration damper, engine mounts.', 3),
  ('Mack', 'PM_D', 'PM D (Major Fluids)', 300000, 'DPF clean, DEF filter, coolant filter, transmission fluid, rear axle fluid.', 4),
  ('Mack', 'PM_E', 'PM E (Coolant)', 750000, 'Complete engine coolant flush and replacement.', 5);

-- Western Star profiles (Daimler M-System, same as Freightliner)
INSERT INTO manufacturer_pm_profiles (manufacturer, service_code, service_name, interval_miles, description, display_order)
VALUES
  ('Western Star', 'M1', 'M1 Service (Safety & Grease)', 25000, 'Chassis Lube (Kingpins, U-Joints, Slack Adjusters), 5th Wheel, Brake Inspection.', 1),
  ('Western Star', 'PM_A', 'PM A (Oil & Fuel)', 50000, 'Engine Oil, Oil Filter, Fuel Filter, Water Separator. Often overlaps with every second M1.', 2),
  ('Western Star', 'M2', 'M2 Service (Annual)', 100000, 'Includes M1 items + Engine Air Filter, Cab HVAC Filters, Power Steering Filter, Vibration Damper check.', 3),
  ('Western Star', 'M3', 'M3 Service (Major Fluids)', 300000, 'Includes M1/M2 + Transmission Fluid, Rear Axle Fluid, Coolant Flush, Air Dryer Cartridge.', 4);
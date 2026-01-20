-- Create manufacturer PM profiles table
CREATE TABLE public.manufacturer_pm_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_code TEXT NOT NULL,
  interval_miles INTEGER,
  interval_days INTEGER,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(manufacturer, service_code)
);

-- Enable RLS
ALTER TABLE public.manufacturer_pm_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies - profiles are read-only for admin roles
CREATE POLICY "Admin roles can view manufacturer profiles"
ON public.manufacturer_pm_profiles
FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner can manage manufacturer profiles"
ON public.manufacturer_pm_profiles
FOR ALL
USING (is_owner(auth.uid()));

-- Add profile_service_id to service_schedules
ALTER TABLE public.service_schedules
ADD COLUMN profile_service_id UUID REFERENCES public.manufacturer_pm_profiles(id);

-- Create updated_at trigger for manufacturer_pm_profiles
CREATE TRIGGER update_manufacturer_pm_profiles_updated_at
BEFORE UPDATE ON public.manufacturer_pm_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Freightliner Cascadia Schedule II (Long Haul) intervals
INSERT INTO public.manufacturer_pm_profiles (manufacturer, service_name, service_code, interval_miles, description, display_order)
VALUES 
  ('Freightliner', 'M1 Service (Safety & Grease)', 'M1', 25000, 'Chassis Lube (Kingpins, U-Joints, Slack Adjusters), 5th Wheel, Brake Inspection.', 1),
  ('Freightliner', 'PM A (Oil & Fuel)', 'PM_A', 50000, 'Engine Oil, Oil Filter, Fuel Filter, Water Separator. Often overlaps with every second M1.', 2),
  ('Freightliner', 'M2 Service (Annual)', 'M2', 100000, 'Includes M1 items + Engine Air Filter, Cab HVAC Filters, Power Steering Filter, Vibration Damper check.', 3),
  ('Freightliner', 'M3 Service (Major Fluids)', 'M3', 300000, 'Includes M1/M2 + Transmission Fluid, Rear Axle Fluid, Coolant Flush, Air Dryer Cartridge.', 4);
-- Create driver_settings table for storing driver preferences and goals
CREATE TABLE public.driver_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL UNIQUE REFERENCES public.drivers(id) ON DELETE CASCADE,
  weekly_miles_goal INTEGER DEFAULT 2500,
  weekly_revenue_goal NUMERIC DEFAULT 2000,
  theme_preference TEXT DEFAULT 'system',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_settings ENABLE ROW LEVEL SECURITY;

-- Drivers can view their own settings
CREATE POLICY "Drivers can view their own settings"
ON public.driver_settings
FOR SELECT
USING (driver_id = get_driver_id_for_user(auth.uid()));

-- Drivers can insert their own settings
CREATE POLICY "Drivers can insert their own settings"
ON public.driver_settings
FOR INSERT
WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()));

-- Drivers can update their own settings
CREATE POLICY "Drivers can update their own settings"
ON public.driver_settings
FOR UPDATE
USING (driver_id = get_driver_id_for_user(auth.uid()));

-- Admins can view all driver settings
CREATE POLICY "Admin roles can view all driver settings"
ON public.driver_settings
FOR SELECT
USING (has_admin_access(auth.uid()));

-- Owner can manage all driver settings
CREATE POLICY "Owner can manage all driver settings"
ON public.driver_settings
FOR ALL
USING (is_owner(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_driver_settings_updated_at
BEFORE UPDATE ON public.driver_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
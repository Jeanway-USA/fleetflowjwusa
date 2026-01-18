-- Update fleet_loads table with comprehensive load tracking fields
ALTER TABLE public.fleet_loads
ADD COLUMN booked_miles integer,
ADD COLUMN fuel_surcharge numeric DEFAULT 0,
ADD COLUMN advance_available numeric DEFAULT 0,
ADD COLUMN advance_taken numeric DEFAULT 0,
ADD COLUMN is_power_only boolean DEFAULT false,
ADD COLUMN lumper numeric DEFAULT 0,
ADD COLUMN accessorials numeric DEFAULT 0,
ADD COLUMN gross_revenue numeric DEFAULT 0,
ADD COLUMN truck_revenue numeric DEFAULT 0,
ADD COLUMN trailer_revenue numeric DEFAULT 0,
ADD COLUMN net_revenue numeric DEFAULT 0,
ADD COLUMN settlement numeric DEFAULT 0,
ADD COLUMN start_miles integer,
ADD COLUMN end_miles integer,
ADD COLUMN actual_miles integer;

-- Rename detention_pay to accessorials (keeping old column for backward compat, will migrate data)
-- Actually let's just use the new accessorials column and keep detention_pay

-- Create load_expenses table for per-load operating expenses
CREATE TABLE public.load_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id uuid NOT NULL REFERENCES public.fleet_loads(id) ON DELETE CASCADE,
  
  -- Fuel
  fuel_gallons numeric DEFAULT 0,
  fuel_cost numeric DEFAULT 0,
  
  -- Fixed payments (allocated per load)
  truck_payment numeric DEFAULT 0,
  trailer_payment numeric DEFAULT 0,
  insurance numeric DEFAULT 0,
  licensing_permits numeric DEFAULT 0,
  lcn_satellite numeric DEFAULT 0,
  cell_phone numeric DEFAULT 0,
  
  -- Variable expenses
  tires numeric DEFAULT 0,
  oil numeric DEFAULT 0,
  repairs_parts numeric DEFAULT 0,
  lumper numeric DEFAULT 0,
  trip_scanning numeric DEFAULT 0,
  card_load numeric DEFAULT 0,
  road_fuel_tax numeric DEFAULT 0,
  prepass_scale numeric DEFAULT 0,
  tolls numeric DEFAULT 0,
  parking numeric DEFAULT 0,
  office_supplies numeric DEFAULT 0,
  
  -- Reserves/Savings
  maintenance_fund numeric DEFAULT 0,
  savings numeric DEFAULT 0,
  retirement numeric DEFAULT 0,
  misc_operating numeric DEFAULT 0,
  
  -- Personal expenses
  food_bev numeric DEFAULT 0,
  motel numeric DEFAULT 0,
  household numeric DEFAULT 0,
  shower numeric DEFAULT 0,
  laundry numeric DEFAULT 0,
  other_personal numeric DEFAULT 0,
  
  -- Totals (calculated)
  operating_total numeric DEFAULT 0,
  personal_total numeric DEFAULT 0,
  
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create company_settings table for compensation package and rates
CREATE TABLE public.company_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert default compensation package settings
INSERT INTO public.company_settings (setting_key, setting_value, description) VALUES
('gross_percentage', '100', 'Gross percentage of load rate'),
('truck_percentage', '65', 'Truck revenue percentage'),
('trailer_percentage', '7', 'Trailer revenue percentage'),
('power_only_percentage', '5', 'Power only percentage'),
('advance_percentage', '30', 'Advance percentage available'),
('owns_trailer', 'false', 'Whether company owns trailer'),
('year', '2026', 'Current operating year');

-- Enable RLS
ALTER TABLE public.load_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for load_expenses (same as fleet_loads)
CREATE POLICY "Admin roles can view all load expenses"
ON public.load_expenses
FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner dispatcher can manage load expenses"
ON public.load_expenses
FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role));

-- RLS policies for company_settings
CREATE POLICY "Admin roles can view settings"
ON public.company_settings
FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner can manage settings"
ON public.company_settings
FOR ALL
USING (is_owner(auth.uid()));

-- Add triggers for updated_at
CREATE TRIGGER update_load_expenses_updated_at
BEFORE UPDATE ON public.load_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
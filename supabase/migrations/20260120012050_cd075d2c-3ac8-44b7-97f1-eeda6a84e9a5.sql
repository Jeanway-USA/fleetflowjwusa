-- Add odometer tracking columns to trucks table
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS current_odometer INTEGER DEFAULT 0;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS last_120_inspection_date DATE;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS last_120_inspection_miles INTEGER;

-- Create work_orders table for active repairs
CREATE TABLE public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  vendor TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  estimated_completion DATE,
  status TEXT NOT NULL DEFAULT 'open',
  service_type TEXT NOT NULL,
  description TEXT,
  cost_estimate NUMERIC DEFAULT 0,
  final_cost NUMERIC,
  is_reimbursable BOOLEAN DEFAULT FALSE,
  invoice_url TEXT,
  odometer_reading INTEGER,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create service_schedules table for PM intervals
CREATE TABLE public.service_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  interval_miles INTEGER,
  interval_days INTEGER,
  last_performed_date DATE,
  last_performed_miles INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(truck_id, service_name)
);

-- Enable RLS on new tables
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies for work_orders
CREATE POLICY "Admin roles can view all work orders"
ON public.work_orders FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner safety can manage work orders"
ON public.work_orders FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role));

-- RLS policies for service_schedules
CREATE POLICY "Admin roles can view all service schedules"
ON public.service_schedules FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner safety can manage service schedules"
ON public.service_schedules FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role));

-- Create trigger for updated_at on work_orders
CREATE TRIGGER update_work_orders_updated_at
BEFORE UPDATE ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on service_schedules
CREATE TRIGGER update_service_schedules_updated_at
BEFORE UPDATE ON public.service_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-create service schedules for new trucks
CREATE OR REPLACE FUNCTION public.create_default_service_schedules()
RETURNS TRIGGER AS $$
BEGIN
  -- Oil Change: 15,000 miles interval
  INSERT INTO public.service_schedules (truck_id, service_name, interval_miles)
  VALUES (NEW.id, 'Oil Change', 15000);
  
  -- Tire Replacement: 80,000 miles interval
  INSERT INTO public.service_schedules (truck_id, service_name, interval_miles)
  VALUES (NEW.id, 'Tire Replacement', 80000);
  
  -- 120-Day Inspection: 120 days interval
  INSERT INTO public.service_schedules (truck_id, service_name, interval_days)
  VALUES (NEW.id, '120-Day Inspection', 120);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create default schedules for new trucks
CREATE TRIGGER create_truck_service_schedules
AFTER INSERT ON public.trucks
FOR EACH ROW
EXECUTE FUNCTION public.create_default_service_schedules();

-- Create default service schedules for existing trucks
INSERT INTO public.service_schedules (truck_id, service_name, interval_miles)
SELECT id, 'Oil Change', 15000 FROM public.trucks
ON CONFLICT (truck_id, service_name) DO NOTHING;

INSERT INTO public.service_schedules (truck_id, service_name, interval_miles)
SELECT id, 'Tire Replacement', 80000 FROM public.trucks
ON CONFLICT (truck_id, service_name) DO NOTHING;

INSERT INTO public.service_schedules (truck_id, service_name, interval_days)
SELECT id, '120-Day Inspection', 120 FROM public.trucks
ON CONFLICT (truck_id, service_name) DO NOTHING;
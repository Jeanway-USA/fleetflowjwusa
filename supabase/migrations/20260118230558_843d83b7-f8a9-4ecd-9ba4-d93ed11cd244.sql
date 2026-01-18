-- Create driver_inspections table for DVIR (Driver Vehicle Inspection Reports)
CREATE TABLE public.driver_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  truck_id UUID NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  inspection_type TEXT NOT NULL CHECK (inspection_type IN ('pre_trip', 'post_trip')),
  inspection_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  odometer_reading INTEGER,
  defects_found BOOLEAN NOT NULL DEFAULT false,
  defect_notes TEXT,
  signature TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'repair_scheduled', 'cleared')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create maintenance_requests table for driver-submitted repair requests
CREATE TABLE public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  truck_id UUID NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('tire', 'brake', 'engine', 'electrical', 'lights', 'trailer', 'other')),
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'acknowledged', 'scheduled', 'in_progress', 'completed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for driver_inspections

-- Drivers can view their own inspections
CREATE POLICY "Drivers can view their own inspections"
ON public.driver_inspections
FOR SELECT
USING (driver_id = get_driver_id_for_user(auth.uid()));

-- Drivers can insert their own inspections
CREATE POLICY "Drivers can insert their own inspections"
ON public.driver_inspections
FOR INSERT
WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()));

-- Admin roles can view all inspections
CREATE POLICY "Admin roles can view all inspections"
ON public.driver_inspections
FOR SELECT
USING (has_admin_access(auth.uid()));

-- Owner and safety can manage all inspections
CREATE POLICY "Owner safety can manage inspections"
ON public.driver_inspections
FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role));

-- RLS Policies for maintenance_requests

-- Drivers can view their own requests
CREATE POLICY "Drivers can view their own maintenance requests"
ON public.maintenance_requests
FOR SELECT
USING (driver_id = get_driver_id_for_user(auth.uid()));

-- Drivers can insert their own requests
CREATE POLICY "Drivers can insert maintenance requests"
ON public.maintenance_requests
FOR INSERT
WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()));

-- Admin roles can view all requests
CREATE POLICY "Admin roles can view all maintenance requests"
ON public.maintenance_requests
FOR SELECT
USING (has_admin_access(auth.uid()));

-- Owner and safety can manage all requests
CREATE POLICY "Owner safety can manage maintenance requests"
ON public.maintenance_requests
FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_driver_inspections_updated_at
BEFORE UPDATE ON public.driver_inspections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_maintenance_requests_updated_at
BEFORE UPDATE ON public.maintenance_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
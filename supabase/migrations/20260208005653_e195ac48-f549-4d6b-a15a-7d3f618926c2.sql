
-- Create facilities/customer table for shipper/receiver management
CREATE TABLE public.facilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  facility_type TEXT NOT NULL DEFAULT 'shipper', -- shipper, receiver, both, warehouse, terminal
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  operating_hours TEXT, -- e.g. "Mon-Fri 6AM-6PM"
  dock_info TEXT, -- dock requirements, number of docks, etc.
  appointment_required BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

-- Policies: Operations and admin can manage, drivers can view
CREATE POLICY "Operations can manage facilities"
  ON public.facilities FOR ALL
  USING (has_operations_access(auth.uid()) OR is_owner(auth.uid()));

CREATE POLICY "Operations can view facilities"
  ON public.facilities FOR SELECT
  USING (has_operations_access(auth.uid()));

CREATE POLICY "Drivers can view facilities"
  ON public.facilities FOR SELECT
  USING (get_driver_id_for_user(auth.uid()) IS NOT NULL);

CREATE POLICY "Payroll can view facilities"
  ON public.facilities FOR SELECT
  USING (has_payroll_access(auth.uid()));

-- Create HOS logs table for ELD/duty status tracking
CREATE TABLE public.hos_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  duty_status TEXT NOT NULL DEFAULT 'off_duty', -- off_duty, sleeper_berth, driving, on_duty_not_driving
  driving_hours_used NUMERIC NOT NULL DEFAULT 0, -- out of 11
  on_duty_hours_used NUMERIC NOT NULL DEFAULT 0, -- out of 14
  cycle_hours_used NUMERIC NOT NULL DEFAULT 0, -- out of 70 (8-day cycle)
  break_taken BOOLEAN DEFAULT false, -- 30-min break taken
  last_status_change TIMESTAMP WITH TIME ZONE DEFAULT now(),
  violations TEXT[], -- any HOS violations
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hos_logs ENABLE ROW LEVEL SECURITY;

-- Drivers can manage their own HOS logs
CREATE POLICY "Drivers can manage their own HOS logs"
  ON public.hos_logs FOR ALL
  USING (driver_id = get_driver_id_for_user(auth.uid()))
  WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()));

-- Operations can view all HOS logs
CREATE POLICY "Operations can view all HOS logs"
  ON public.hos_logs FOR SELECT
  USING (has_operations_access(auth.uid()));

-- Owner/safety can manage all HOS logs
CREATE POLICY "Owner safety can manage HOS logs"
  ON public.hos_logs FOR ALL
  USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_facilities_updated_at
  BEFORE UPDATE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hos_logs_updated_at
  BEFORE UPDATE ON public.hos_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

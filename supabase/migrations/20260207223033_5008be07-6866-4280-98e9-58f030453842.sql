
-- Create unified driver_requests table
CREATE TABLE public.driver_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id),
  request_type TEXT NOT NULL, -- 'detention', 'home_time', 'pto', 'maintenance'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'denied', 'completed'
  subject TEXT NOT NULL,
  description TEXT,
  load_id UUID REFERENCES public.fleet_loads(id),
  truck_id UUID REFERENCES public.trucks(id),
  responded_by UUID,
  responded_at TIMESTAMPTZ,
  response_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_requests ENABLE ROW LEVEL SECURITY;

-- Drivers can insert their own requests
CREATE POLICY "Drivers can insert their own requests"
ON public.driver_requests
FOR INSERT
WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()));

-- Drivers can view their own requests
CREATE POLICY "Drivers can view their own requests"
ON public.driver_requests
FOR SELECT
USING (driver_id = get_driver_id_for_user(auth.uid()));

-- Operations roles can view all requests
CREATE POLICY "Operations can view all requests"
ON public.driver_requests
FOR SELECT
USING (has_operations_access(auth.uid()));

-- Owner and dispatcher can manage (update) all requests
CREATE POLICY "Owner dispatcher can manage requests"
ON public.driver_requests
FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role));

-- Safety roles can view all requests
CREATE POLICY "Safety can view all requests"
ON public.driver_requests
FOR SELECT
USING (has_safety_access(auth.uid()));

-- Trigger to auto-update updated_at
CREATE TRIGGER update_driver_requests_updated_at
BEFORE UPDATE ON public.driver_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

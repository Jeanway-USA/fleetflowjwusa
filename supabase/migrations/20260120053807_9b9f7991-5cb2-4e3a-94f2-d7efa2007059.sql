-- Create trailers table
CREATE TABLE public.trailers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_number TEXT NOT NULL UNIQUE,
  trailer_type TEXT NOT NULL DEFAULT 'Dry Van',
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  license_plate TEXT,
  license_plate_state TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_driver_id UUID,
  last_inspection_date DATE,
  next_inspection_date DATE,
  owned_or_leased TEXT DEFAULT 'owned',
  monthly_payment NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trailer_assignments table for tracking assignment history
CREATE TABLE public.trailer_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trailer_id UUID NOT NULL REFERENCES public.trailers(id) ON DELETE CASCADE,
  driver_id UUID,
  truck_id UUID,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  released_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add trailer_id to fleet_loads
ALTER TABLE public.fleet_loads ADD COLUMN trailer_id UUID;

-- Enable RLS on trailers
ALTER TABLE public.trailers ENABLE ROW LEVEL SECURITY;

-- RLS policies for trailers
CREATE POLICY "Admin roles can view all trailers"
ON public.trailers FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Drivers can view their assigned trailer"
ON public.trailers FOR SELECT
USING (current_driver_id = get_driver_id_for_user(auth.uid()));

CREATE POLICY "Owner dispatcher safety can manage trailers"
ON public.trailers FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'safety'::app_role));

-- Enable RLS on trailer_assignments
ALTER TABLE public.trailer_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for trailer_assignments
CREATE POLICY "Admin roles can view all trailer assignments"
ON public.trailer_assignments FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner dispatcher can manage trailer assignments"
ON public.trailer_assignments FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role));

-- Trigger for updated_at on trailers
CREATE TRIGGER update_trailers_updated_at
BEFORE UPDATE ON public.trailers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
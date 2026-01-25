-- Create detention_requests table for dispatcher review workflow
CREATE TABLE public.detention_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    load_id UUID NOT NULL REFERENCES public.fleet_loads(id) ON DELETE CASCADE,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    response_notes TEXT,
    responded_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    responded_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.detention_requests ENABLE ROW LEVEL SECURITY;

-- Drivers can insert their own detention requests
CREATE POLICY "Drivers can insert detention requests"
ON public.detention_requests
FOR INSERT
WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()));

-- Drivers can view their own detention requests
CREATE POLICY "Drivers can view their detention requests"
ON public.detention_requests
FOR SELECT
USING (driver_id = get_driver_id_for_user(auth.uid()));

-- Operations roles can view all detention requests
CREATE POLICY "Operations can view all detention requests"
ON public.detention_requests
FOR SELECT
USING (has_operations_access(auth.uid()));

-- Owner/dispatcher can manage detention requests
CREATE POLICY "Owner dispatcher can manage detention requests"
ON public.detention_requests
FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role));
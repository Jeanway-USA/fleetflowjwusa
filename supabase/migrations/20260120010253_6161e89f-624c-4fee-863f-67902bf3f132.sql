-- Create a table to track status changes for fleet loads
CREATE TABLE public.load_status_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id UUID NOT NULL REFERENCES public.fleet_loads(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.load_status_logs ENABLE ROW LEVEL SECURITY;

-- Admin roles can view all status logs
CREATE POLICY "Admin roles can view all status logs"
ON public.load_status_logs
FOR SELECT
USING (has_admin_access(auth.uid()));

-- Owner and dispatcher can manage status logs
CREATE POLICY "Owner dispatcher can manage status logs"
ON public.load_status_logs
FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role));

-- Drivers can view status logs for their assigned loads
CREATE POLICY "Drivers can view status logs for their loads"
ON public.load_status_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.fleet_loads fl
    WHERE fl.id = load_status_logs.load_id
    AND fl.driver_id = get_driver_id_for_user(auth.uid())
  )
);

-- Create index for faster lookups
CREATE INDEX idx_load_status_logs_load_id ON public.load_status_logs(load_id);
CREATE INDEX idx_load_status_logs_changed_at ON public.load_status_logs(changed_at DESC);

-- Create a function to automatically log status changes
CREATE OR REPLACE FUNCTION public.log_load_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.load_status_logs (load_id, previous_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-log status changes
CREATE TRIGGER trigger_log_load_status_change
AFTER UPDATE ON public.fleet_loads
FOR EACH ROW
EXECUTE FUNCTION public.log_load_status_change();
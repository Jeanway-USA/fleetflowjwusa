-- Create a table for accessorials with type, amount, and percentage
CREATE TABLE public.load_accessorials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id UUID NOT NULL REFERENCES public.fleet_loads(id) ON DELETE CASCADE,
  accessorial_type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC DEFAULT 100,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.load_accessorials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admin roles can view all accessorials"
ON public.load_accessorials
FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner dispatcher can manage accessorials"
ON public.load_accessorials
FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_load_accessorials_load_id ON public.load_accessorials(load_id);

-- Create trigger for updated_at
CREATE TRIGGER update_load_accessorials_updated_at
BEFORE UPDATE ON public.load_accessorials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create a standalone expenses table for tracking general business expenses
-- These can optionally be linked to a load or truck
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expense_type TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  gallons NUMERIC, -- For fuel expenses
  vendor TEXT,
  load_id UUID REFERENCES public.fleet_loads(id) ON DELETE SET NULL,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Owner payroll can access expenses"
ON public.expenses FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role));

CREATE POLICY "Dispatcher can view expenses"
ON public.expenses FOR SELECT
USING (has_role(auth.uid(), 'dispatcher'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
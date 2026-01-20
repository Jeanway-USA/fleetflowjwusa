-- Create settlements table
CREATE TABLE public.settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_revenue NUMERIC NOT NULL DEFAULT 0,
  driver_pay NUMERIC NOT NULL DEFAULT 0,
  fuel_advances NUMERIC DEFAULT 0,
  cash_advances NUMERIC DEFAULT 0,
  escrow_deduction NUMERIC DEFAULT 0,
  other_deductions NUMERIC DEFAULT 0,
  net_pay NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create settlement_line_items table
CREATE TABLE public.settlement_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  load_id UUID,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'revenue',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on settlements
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- RLS policies for settlements
CREATE POLICY "Drivers can view their own settlements"
ON public.settlements FOR SELECT
USING (driver_id = get_driver_id_for_user(auth.uid()));

CREATE POLICY "Owner payroll can manage settlements"
ON public.settlements FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role));

CREATE POLICY "Owner payroll can view all settlements"
ON public.settlements FOR SELECT
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role));

-- Enable RLS on settlement_line_items
ALTER TABLE public.settlement_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for settlement_line_items
CREATE POLICY "Users can view line items for their settlements"
ON public.settlement_line_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.settlements s
  WHERE s.id = settlement_line_items.settlement_id
  AND (s.driver_id = get_driver_id_for_user(auth.uid()) OR is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
));

CREATE POLICY "Owner payroll can manage line items"
ON public.settlement_line_items FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role));

-- Trigger for updated_at on settlements
CREATE TRIGGER update_settlements_updated_at
BEFORE UPDATE ON public.settlements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
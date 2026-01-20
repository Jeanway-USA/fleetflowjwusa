-- Phase 3: Incident/Accident Reporting Module

-- Create incidents table
CREATE TABLE public.incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  incident_type TEXT NOT NULL DEFAULT 'accident',
  severity TEXT NOT NULL DEFAULT 'minor',
  driver_id UUID REFERENCES public.drivers(id),
  truck_id UUID REFERENCES public.trucks(id),
  trailer_id UUID REFERENCES public.trailers(id),
  location_description TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  description TEXT NOT NULL,
  police_report_number TEXT,
  citation_issued BOOLEAN DEFAULT false,
  injuries_reported BOOLEAN DEFAULT false,
  injury_details TEXT,
  estimated_damage NUMERIC DEFAULT 0,
  insurance_claim_number TEXT,
  status TEXT NOT NULL DEFAULT 'reported',
  resolution_notes TEXT,
  reported_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create incident_photos table
CREATE TABLE public.incident_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  description TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create incident_witnesses table
CREATE TABLE public.incident_witnesses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  statement TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all incident tables
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_witnesses ENABLE ROW LEVEL SECURITY;

-- RLS policies for incidents
CREATE POLICY "Admin roles can view all incidents"
ON public.incidents FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner safety can manage incidents"
ON public.incidents FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Drivers can view their own incidents"
ON public.incidents FOR SELECT
USING (driver_id = get_driver_id_for_user(auth.uid()));

CREATE POLICY "Drivers can insert incidents"
ON public.incidents FOR INSERT
WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) OR has_admin_access(auth.uid()));

-- RLS policies for incident_photos
CREATE POLICY "Admin roles can view all incident photos"
ON public.incident_photos FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner safety can manage incident photos"
ON public.incident_photos FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Drivers can view photos for their incidents"
ON public.incident_photos FOR SELECT
USING (EXISTS (
  SELECT 1 FROM incidents i 
  WHERE i.id = incident_photos.incident_id 
  AND i.driver_id = get_driver_id_for_user(auth.uid())
));

CREATE POLICY "Drivers can insert photos for their incidents"
ON public.incident_photos FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM incidents i 
  WHERE i.id = incident_photos.incident_id 
  AND (i.driver_id = get_driver_id_for_user(auth.uid()) OR has_admin_access(auth.uid()))
));

-- RLS policies for incident_witnesses
CREATE POLICY "Admin roles can view all witnesses"
ON public.incident_witnesses FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner safety can manage witnesses"
ON public.incident_witnesses FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Drivers can view witnesses for their incidents"
ON public.incident_witnesses FOR SELECT
USING (EXISTS (
  SELECT 1 FROM incidents i 
  WHERE i.id = incident_witnesses.incident_id 
  AND i.driver_id = get_driver_id_for_user(auth.uid())
));

CREATE POLICY "Drivers can insert witnesses for their incidents"
ON public.incident_witnesses FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM incidents i 
  WHERE i.id = incident_witnesses.incident_id 
  AND (i.driver_id = get_driver_id_for_user(auth.uid()) OR has_admin_access(auth.uid()))
));

-- Create trigger for updated_at
CREATE TRIGGER update_incidents_updated_at
BEFORE UPDATE ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 4: Driver Performance Metrics

-- Create driver_performance_metrics table
CREATE TABLE public.driver_performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id),
  period_type TEXT NOT NULL DEFAULT 'monthly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_miles INTEGER DEFAULT 0,
  total_loads INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  on_time_deliveries INTEGER DEFAULT 0,
  late_deliveries INTEGER DEFAULT 0,
  fuel_efficiency_mpg NUMERIC,
  dvir_compliance_rate NUMERIC DEFAULT 100,
  incidents_count INTEGER DEFAULT 0,
  safety_score NUMERIC DEFAULT 100,
  overall_score NUMERIC DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for driver_performance_metrics
CREATE POLICY "Admin roles can view all performance metrics"
ON public.driver_performance_metrics FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner can manage performance metrics"
ON public.driver_performance_metrics FOR ALL
USING (is_owner(auth.uid()));

CREATE POLICY "Drivers can view their own performance"
ON public.driver_performance_metrics FOR SELECT
USING (driver_id = get_driver_id_for_user(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_driver_performance_updated_at
BEFORE UPDATE ON public.driver_performance_metrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 5: IFTA Reporting

-- Create ifta_records table
CREATE TABLE public.ifta_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quarter TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  total_miles INTEGER DEFAULT 0,
  taxable_miles INTEGER DEFAULT 0,
  fuel_gallons NUMERIC DEFAULT 0,
  fuel_cost NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_owed NUMERIC DEFAULT 0,
  truck_id UUID REFERENCES public.trucks(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create fuel_purchases table (enhanced tracking)
CREATE TABLE public.fuel_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  truck_id UUID REFERENCES public.trucks(id),
  driver_id UUID REFERENCES public.drivers(id),
  jurisdiction TEXT NOT NULL,
  gallons NUMERIC NOT NULL DEFAULT 0,
  price_per_gallon NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  vendor TEXT,
  receipt_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ifta_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_purchases ENABLE ROW LEVEL SECURITY;

-- RLS policies for ifta_records
CREATE POLICY "Admin roles can view IFTA records"
ON public.ifta_records FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner payroll can manage IFTA records"
ON public.ifta_records FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role));

-- RLS policies for fuel_purchases
CREATE POLICY "Admin roles can view fuel purchases"
ON public.fuel_purchases FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner payroll can manage fuel purchases"
ON public.fuel_purchases FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role));

CREATE POLICY "Drivers can view their own fuel purchases"
ON public.fuel_purchases FOR SELECT
USING (driver_id = get_driver_id_for_user(auth.uid()));

CREATE POLICY "Drivers can insert their own fuel purchases"
ON public.fuel_purchases FOR INSERT
WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) OR has_admin_access(auth.uid()));

-- Create triggers for updated_at
CREATE TRIGGER update_ifta_records_updated_at
BEFORE UPDATE ON public.ifta_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fuel_purchases_updated_at
BEFORE UPDATE ON public.fuel_purchases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
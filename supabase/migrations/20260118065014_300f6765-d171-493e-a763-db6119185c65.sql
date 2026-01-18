-- Add agency_code column to fleet_loads
ALTER TABLE public.fleet_loads ADD COLUMN agency_code TEXT;

-- Create company_resources table for mechanics, roadside, truck wash, etc.
CREATE TABLE public.company_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_type TEXT NOT NULL, -- 'mechanic', 'roadside', 'truck_wash', 'load_agent'
  name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  service_area TEXT, -- For roadside services (state abbreviations)
  notes TEXT,
  -- Load agent specific fields
  agent_code TEXT, -- 3-letter code for load agents
  agent_status TEXT, -- 'safe', 'unsafe' for scorecard
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_resources ENABLE ROW LEVEL SECURITY;

-- Create policies - admin roles can manage, all authenticated users can view
CREATE POLICY "Admin roles can manage company resources"
ON public.company_resources
FOR ALL
USING (has_admin_access(auth.uid()));

CREATE POLICY "Authenticated users can view company resources"
ON public.company_resources
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create indexes
CREATE INDEX idx_company_resources_type ON public.company_resources(resource_type);
CREATE INDEX idx_company_resources_agent_code ON public.company_resources(agent_code);
CREATE INDEX idx_company_resources_agent_status ON public.company_resources(agent_status);

-- Add updated_at trigger
CREATE TRIGGER update_company_resources_updated_at
BEFORE UPDATE ON public.company_resources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
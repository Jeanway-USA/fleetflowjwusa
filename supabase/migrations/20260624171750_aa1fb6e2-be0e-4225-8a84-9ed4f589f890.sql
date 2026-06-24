-- Structured intermediate stops for loads
CREATE TABLE public.load_intermediate_stops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id UUID NOT NULL REFERENCES public.fleet_loads(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  stop_number INTEGER NOT NULL,
  stop_type TEXT,
  facility_name TEXT,
  location TEXT NOT NULL,
  scheduled_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  remaining_hos NUMERIC,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (load_id, stop_number)
);

CREATE INDEX idx_load_intermediate_stops_load ON public.load_intermediate_stops(load_id);
CREATE INDEX idx_load_intermediate_stops_org ON public.load_intermediate_stops(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.load_intermediate_stops TO authenticated;
GRANT ALL ON public.load_intermediate_stops TO service_role;

ALTER TABLE public.load_intermediate_stops ENABLE ROW LEVEL SECURITY;

-- Org-scoped access, mirroring fleet_loads tenant isolation
CREATE POLICY "Org members can view their load stops"
  ON public.load_intermediate_stops FOR SELECT TO authenticated
  USING (org_id = (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Org members can insert load stops"
  ON public.load_intermediate_stops FOR INSERT TO authenticated
  WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Org members can update load stops"
  ON public.load_intermediate_stops FOR UPDATE TO authenticated
  USING (org_id = (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Org members can delete load stops"
  ON public.load_intermediate_stops FOR DELETE TO authenticated
  USING (org_id = (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_load_intermediate_stops_updated_at
  BEFORE UPDATE ON public.load_intermediate_stops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

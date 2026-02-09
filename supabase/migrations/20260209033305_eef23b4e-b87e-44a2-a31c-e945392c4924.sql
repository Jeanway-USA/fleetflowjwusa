
-- ============================================================
-- CRM Tables: crm_contacts, crm_activities, crm_contact_loads
-- ============================================================

-- 1. crm_contacts
CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_type text NOT NULL,
  company_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  tags text[] DEFAULT '{}',
  agent_code text,
  agent_status text,
  website text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

-- Operations (owner + dispatcher) full CRUD
CREATE POLICY "Operations can manage CRM contacts"
  ON public.crm_contacts FOR ALL
  USING (has_operations_access(auth.uid()));

-- Safety read-only
CREATE POLICY "Safety can view CRM contacts"
  ON public.crm_contacts FOR SELECT
  USING (has_role(auth.uid(), 'safety'::app_role));

-- Drivers read-only
CREATE POLICY "Drivers can view CRM contacts"
  ON public.crm_contacts FOR SELECT
  USING (get_driver_id_for_user(auth.uid()) IS NOT NULL);

-- updated_at trigger
CREATE TRIGGER update_crm_contacts_updated_at
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index on contact_type for filtering
CREATE INDEX idx_crm_contacts_type ON public.crm_contacts (contact_type);
CREATE INDEX idx_crm_contacts_company ON public.crm_contacts (company_name);

-- 2. crm_activities
CREATE TABLE public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  activity_type text NOT NULL DEFAULT 'note',
  subject text NOT NULL,
  description text,
  activity_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

-- Operations full CRUD
CREATE POLICY "Operations can manage CRM activities"
  ON public.crm_activities FOR ALL
  USING (has_operations_access(auth.uid()));

-- Safety read-only
CREATE POLICY "Safety can view CRM activities"
  ON public.crm_activities FOR SELECT
  USING (has_role(auth.uid(), 'safety'::app_role));

-- Drivers read-only
CREATE POLICY "Drivers can view CRM activities"
  ON public.crm_activities FOR SELECT
  USING (get_driver_id_for_user(auth.uid()) IS NOT NULL);

CREATE INDEX idx_crm_activities_contact ON public.crm_activities (contact_id);
CREATE INDEX idx_crm_activities_date ON public.crm_activities (activity_date DESC);

-- 3. crm_contact_loads (linking table)
CREATE TABLE public.crm_contact_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.fleet_loads(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, load_id, relationship_type)
);

ALTER TABLE public.crm_contact_loads ENABLE ROW LEVEL SECURITY;

-- Operations full CRUD
CREATE POLICY "Operations can manage CRM contact loads"
  ON public.crm_contact_loads FOR ALL
  USING (has_operations_access(auth.uid()));

-- Safety read-only
CREATE POLICY "Safety can view CRM contact loads"
  ON public.crm_contact_loads FOR SELECT
  USING (has_role(auth.uid(), 'safety'::app_role));

-- Drivers read-only
CREATE POLICY "Drivers can view CRM contact loads"
  ON public.crm_contact_loads FOR SELECT
  USING (get_driver_id_for_user(auth.uid()) IS NOT NULL);

CREATE INDEX idx_crm_contact_loads_contact ON public.crm_contact_loads (contact_id);
CREATE INDEX idx_crm_contact_loads_load ON public.crm_contact_loads (load_id);

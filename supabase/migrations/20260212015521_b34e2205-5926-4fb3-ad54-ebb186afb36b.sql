
-- Temporarily disable audit triggers that fail without auth.uid()
ALTER TABLE public.drivers DISABLE TRIGGER audit_drivers_changes;
ALTER TABLE public.driver_payroll DISABLE TRIGGER audit_driver_payroll_changes;
ALTER TABLE public.settlements DISABLE TRIGGER audit_settlements_changes;
ALTER TABLE public.incidents DISABLE TRIGGER audit_incidents_changes;

-- ============================================================
-- Phase 1A: Create organizations table
-- ============================================================
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subscription_tier text NOT NULL DEFAULT 'solo_bco',
  trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Phase 1B: Add org_id to profiles
ALTER TABLE public.profiles ADD COLUMN org_id uuid REFERENCES public.organizations(id);

-- Phase 1D: Helper function
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- RLS on organizations
CREATE POLICY "Members can view their org"
  ON public.organizations FOR SELECT USING (id = get_user_org_id(auth.uid()));

CREATE POLICY "Org owners can update their org"
  ON public.organizations FOR UPDATE USING (id = get_user_org_id(auth.uid()) AND is_owner(auth.uid()));

CREATE POLICY "Authenticated users can create orgs"
  ON public.organizations FOR INSERT TO authenticated WITH CHECK (true);

-- Phase 1C: Add org_id to all data tables
ALTER TABLE public.fleet_loads ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.trucks ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.trailers ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.drivers ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.expenses ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.agency_loads ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.agent_commissions ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.settlements ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.driver_payroll ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.crm_contacts ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.crm_activities ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.documents ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.incidents ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.maintenance_requests ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.driver_inspections ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.driver_notifications ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.driver_requests ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.general_ledger ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.company_resources ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.company_settings ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.detention_requests ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.driver_locations ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.driver_performance_metrics ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.driver_settings ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.fuel_purchases ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.hos_logs ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.ifta_records ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.load_expenses ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.load_accessorials ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.inspection_photos ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.incident_photos ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.incident_witnesses ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.audit_logs ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.crm_contact_loads ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.settlement_line_items ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.fuel_stops_cache ADD COLUMN org_id uuid REFERENCES public.organizations(id);

-- Phase 1F: Create default org and backfill
INSERT INTO public.organizations (id, name, subscription_tier, trial_ends_at, is_active)
VALUES ('a0000000-0000-0000-0000-000000000001', 'JeanWay USA', 'all_in_one', NULL, true);

UPDATE public.profiles SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.fleet_loads SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.trucks SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.trailers SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.drivers SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.expenses SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.agency_loads SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.agent_commissions SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.settlements SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_payroll SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.crm_contacts SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.crm_activities SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.documents SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.incidents SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.maintenance_requests SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_inspections SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_notifications SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_requests SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.general_ledger SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.company_resources SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.company_settings SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.detention_requests SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_locations SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_performance_metrics SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_settings SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.fuel_purchases SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.hos_logs SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.ifta_records SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.load_expenses SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.load_accessorials SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.inspection_photos SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.incident_photos SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.incident_witnesses SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.audit_logs SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.crm_contact_loads SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.settlement_line_items SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.fuel_stops_cache SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- Re-enable audit triggers
ALTER TABLE public.drivers ENABLE TRIGGER audit_drivers_changes;
ALTER TABLE public.driver_payroll ENABLE TRIGGER audit_driver_payroll_changes;
ALTER TABLE public.settlements ENABLE TRIGGER audit_settlements_changes;
ALTER TABLE public.incidents ENABLE TRIGGER audit_incidents_changes;

-- Trigger for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

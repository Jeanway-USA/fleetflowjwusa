
-- ============================================================
-- MULTI-TENANT RLS REMEDIATION MIGRATION
-- Adds org_id to missing tables + rewrites ALL policies with org_id isolation
-- ============================================================

-- ==========================================
-- STEP 1: Add org_id to tables missing it
-- ==========================================

-- load_status_logs
ALTER TABLE public.load_status_logs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.load_status_logs SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- maintenance_logs
ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.maintenance_logs SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- service_schedules
ALTER TABLE public.service_schedules ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.service_schedules SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- work_orders
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.work_orders SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- pm_notifications
ALTER TABLE public.pm_notifications ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.pm_notifications SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- facilities
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.facilities SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- trailer_assignments
ALTER TABLE public.trailer_assignments ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.trailer_assignments SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.user_roles SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- ==========================================
-- STEP 2: Drop ALL existing RLS policies
-- ==========================================

-- agency_loads
DROP POLICY IF EXISTS "Operations roles can view all agency loads" ON public.agency_loads;
DROP POLICY IF EXISTS "Owner dispatcher can manage agency loads" ON public.agency_loads;

-- agent_commissions
DROP POLICY IF EXISTS "Owner payroll can manage commissions" ON public.agent_commissions;
DROP POLICY IF EXISTS "Owner payroll can view commissions" ON public.agent_commissions;

-- audit_logs
DROP POLICY IF EXISTS "Owners can view audit logs" ON public.audit_logs;

-- company_resources
DROP POLICY IF EXISTS "Operations roles can manage company resources" ON public.company_resources;
DROP POLICY IF EXISTS "Operations roles can view company resources" ON public.company_resources;

-- company_settings
DROP POLICY IF EXISTS "Admin roles can view settings" ON public.company_settings;
DROP POLICY IF EXISTS "Owner can manage settings" ON public.company_settings;

-- crm_activities
DROP POLICY IF EXISTS "Drivers can view CRM activities" ON public.crm_activities;
DROP POLICY IF EXISTS "Operations can manage CRM activities" ON public.crm_activities;
DROP POLICY IF EXISTS "Safety can view CRM activities" ON public.crm_activities;

-- crm_contact_loads
DROP POLICY IF EXISTS "Drivers can view CRM contact loads" ON public.crm_contact_loads;
DROP POLICY IF EXISTS "Operations can manage CRM contact loads" ON public.crm_contact_loads;
DROP POLICY IF EXISTS "Safety can view CRM contact loads" ON public.crm_contact_loads;

-- crm_contacts
DROP POLICY IF EXISTS "Drivers can view CRM contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "Operations can manage CRM contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "Safety can view CRM contacts" ON public.crm_contacts;

-- detention_requests
DROP POLICY IF EXISTS "Drivers can insert detention requests" ON public.detention_requests;
DROP POLICY IF EXISTS "Drivers can view their detention requests" ON public.detention_requests;
DROP POLICY IF EXISTS "Operations can view all detention requests" ON public.detention_requests;
DROP POLICY IF EXISTS "Owner dispatcher can manage detention requests" ON public.detention_requests;

-- documents
DROP POLICY IF EXISTS "Operations roles can manage documents" ON public.documents;
DROP POLICY IF EXISTS "Operations roles can view all documents" ON public.documents;
DROP POLICY IF EXISTS "Users can upload their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;

-- driver_inspections
DROP POLICY IF EXISTS "Drivers can insert their own inspections" ON public.driver_inspections;
DROP POLICY IF EXISTS "Drivers can view their own inspections" ON public.driver_inspections;
DROP POLICY IF EXISTS "Owner safety can manage inspections" ON public.driver_inspections;
DROP POLICY IF EXISTS "Safety roles can view all inspections" ON public.driver_inspections;

-- driver_locations
DROP POLICY IF EXISTS "Drivers can upsert their own location" ON public.driver_locations;
DROP POLICY IF EXISTS "Operations can view sharing driver locations" ON public.driver_locations;

-- driver_notifications
DROP POLICY IF EXISTS "Drivers can delete their own notifications" ON public.driver_notifications;
DROP POLICY IF EXISTS "Drivers can update their own notifications" ON public.driver_notifications;
DROP POLICY IF EXISTS "Drivers can view their own notifications" ON public.driver_notifications;
DROP POLICY IF EXISTS "Operations roles can view all notifications" ON public.driver_notifications;
DROP POLICY IF EXISTS "Owner dispatcher can manage notifications" ON public.driver_notifications;

-- driver_payroll
DROP POLICY IF EXISTS "Drivers can view their own payroll" ON public.driver_payroll;
DROP POLICY IF EXISTS "Owner payroll can manage payroll" ON public.driver_payroll;
DROP POLICY IF EXISTS "Owner payroll can view all payroll" ON public.driver_payroll;

-- driver_performance_metrics
DROP POLICY IF EXISTS "Drivers can view their own performance" ON public.driver_performance_metrics;
DROP POLICY IF EXISTS "Operations roles can view all performance metrics" ON public.driver_performance_metrics;
DROP POLICY IF EXISTS "Owner can manage performance metrics" ON public.driver_performance_metrics;

-- driver_requests
DROP POLICY IF EXISTS "Drivers can insert their own requests" ON public.driver_requests;
DROP POLICY IF EXISTS "Drivers can view their own requests" ON public.driver_requests;
DROP POLICY IF EXISTS "Operations can view all requests" ON public.driver_requests;
DROP POLICY IF EXISTS "Owner dispatcher can manage requests" ON public.driver_requests;
DROP POLICY IF EXISTS "Safety can view all requests" ON public.driver_requests;

-- driver_settings
DROP POLICY IF EXISTS "Drivers can insert their own settings" ON public.driver_settings;
DROP POLICY IF EXISTS "Drivers can update their own settings" ON public.driver_settings;
DROP POLICY IF EXISTS "Drivers can view their own settings" ON public.driver_settings;
DROP POLICY IF EXISTS "Owner can manage all driver settings" ON public.driver_settings;

-- drivers
DROP POLICY IF EXISTS "Drivers can view their own record" ON public.drivers;
DROP POLICY IF EXISTS "Owner and payroll can manage drivers" ON public.drivers;
DROP POLICY IF EXISTS "Payroll roles can view all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Safety role can view all drivers" ON public.drivers;

-- expenses
DROP POLICY IF EXISTS "Operations roles can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Owner payroll can access expenses" ON public.expenses;

-- facilities
DROP POLICY IF EXISTS "Drivers can view facilities" ON public.facilities;
DROP POLICY IF EXISTS "Operations can manage facilities" ON public.facilities;
DROP POLICY IF EXISTS "Operations can view facilities" ON public.facilities;
DROP POLICY IF EXISTS "Payroll can view facilities" ON public.facilities;

-- fleet_loads
DROP POLICY IF EXISTS "Drivers can update status on their assigned loads" ON public.fleet_loads;
DROP POLICY IF EXISTS "Drivers can view their assigned loads" ON public.fleet_loads;
DROP POLICY IF EXISTS "Operations roles can view all fleet loads" ON public.fleet_loads;
DROP POLICY IF EXISTS "Owner dispatcher can manage fleet loads" ON public.fleet_loads;

-- fuel_purchases
DROP POLICY IF EXISTS "Drivers can insert their own fuel purchases" ON public.fuel_purchases;
DROP POLICY IF EXISTS "Drivers can view their own fuel purchases" ON public.fuel_purchases;
DROP POLICY IF EXISTS "Operations roles can view fuel purchases" ON public.fuel_purchases;
DROP POLICY IF EXISTS "Owner payroll can manage fuel purchases" ON public.fuel_purchases;
DROP POLICY IF EXISTS "Payroll roles can view fuel purchases" ON public.fuel_purchases;

-- fuel_stops_cache
DROP POLICY IF EXISTS "Drivers can view fuel stops" ON public.fuel_stops_cache;
DROP POLICY IF EXISTS "Operations can view fuel stops" ON public.fuel_stops_cache;
DROP POLICY IF EXISTS "Owner can manage fuel stops" ON public.fuel_stops_cache;

-- general_ledger
DROP POLICY IF EXISTS "Owner payroll can access ledger" ON public.general_ledger;

-- hos_logs
DROP POLICY IF EXISTS "Drivers can manage their own HOS logs" ON public.hos_logs;
DROP POLICY IF EXISTS "Operations can view all HOS logs" ON public.hos_logs;
DROP POLICY IF EXISTS "Owner safety can manage HOS logs" ON public.hos_logs;

-- ifta_records
DROP POLICY IF EXISTS "Owner payroll can manage IFTA records" ON public.ifta_records;
DROP POLICY IF EXISTS "Payroll roles can view IFTA records" ON public.ifta_records;

-- incident_photos
DROP POLICY IF EXISTS "Drivers can insert photos for their incidents" ON public.incident_photos;
DROP POLICY IF EXISTS "Drivers can view photos for their incidents" ON public.incident_photos;
DROP POLICY IF EXISTS "Owner safety can manage incident photos" ON public.incident_photos;
DROP POLICY IF EXISTS "Safety roles can view all incident photos" ON public.incident_photos;

-- incident_witnesses
DROP POLICY IF EXISTS "Drivers can insert witnesses for their incidents" ON public.incident_witnesses;
DROP POLICY IF EXISTS "Owner safety can manage witnesses" ON public.incident_witnesses;
DROP POLICY IF EXISTS "Safety roles can delete witnesses" ON public.incident_witnesses;
DROP POLICY IF EXISTS "Safety roles can insert witnesses" ON public.incident_witnesses;
DROP POLICY IF EXISTS "Safety roles can update witnesses" ON public.incident_witnesses;
DROP POLICY IF EXISTS "Safety roles can view all witnesses" ON public.incident_witnesses;

-- incidents
DROP POLICY IF EXISTS "Drivers can insert incidents" ON public.incidents;
DROP POLICY IF EXISTS "Drivers can view their own incidents" ON public.incidents;
DROP POLICY IF EXISTS "Owner safety can manage incidents" ON public.incidents;
DROP POLICY IF EXISTS "Safety roles can view all incidents" ON public.incidents;

-- inspection_photos
DROP POLICY IF EXISTS "Drivers can insert photos for their inspections" ON public.inspection_photos;
DROP POLICY IF EXISTS "Drivers can view photos for their inspections" ON public.inspection_photos;
DROP POLICY IF EXISTS "Owner safety can manage inspection photos" ON public.inspection_photos;
DROP POLICY IF EXISTS "Safety roles can view all inspection photos" ON public.inspection_photos;

-- load_accessorials
DROP POLICY IF EXISTS "Operations roles can view all accessorials" ON public.load_accessorials;
DROP POLICY IF EXISTS "Owner dispatcher can manage accessorials" ON public.load_accessorials;

-- load_expenses
DROP POLICY IF EXISTS "Operations roles can view all load expenses" ON public.load_expenses;
DROP POLICY IF EXISTS "Owner dispatcher can manage load expenses" ON public.load_expenses;

-- load_status_logs
DROP POLICY IF EXISTS "Drivers can view status logs for their loads" ON public.load_status_logs;
DROP POLICY IF EXISTS "Operations roles can view all status logs" ON public.load_status_logs;
DROP POLICY IF EXISTS "Owner dispatcher can manage status logs" ON public.load_status_logs;

-- maintenance_logs
DROP POLICY IF EXISTS "Owner safety can manage maintenance" ON public.maintenance_logs;
DROP POLICY IF EXISTS "Safety roles can view maintenance" ON public.maintenance_logs;

-- maintenance_requests
DROP POLICY IF EXISTS "Drivers can insert maintenance requests" ON public.maintenance_requests;
DROP POLICY IF EXISTS "Drivers can view their own maintenance requests" ON public.maintenance_requests;
DROP POLICY IF EXISTS "Owner safety can manage maintenance requests" ON public.maintenance_requests;
DROP POLICY IF EXISTS "Safety roles can view all maintenance requests" ON public.maintenance_requests;

-- manufacturer_pm_profiles (shared reference data - keep but add org scoping)
DROP POLICY IF EXISTS "Owner can manage manufacturer profiles" ON public.manufacturer_pm_profiles;
DROP POLICY IF EXISTS "Safety roles can view manufacturer profiles" ON public.manufacturer_pm_profiles;

-- pm_notifications
DROP POLICY IF EXISTS "Safety roles can delete PM notifications" ON public.pm_notifications;
DROP POLICY IF EXISTS "Safety roles can update PM notifications" ON public.pm_notifications;
DROP POLICY IF EXISTS "Safety roles can view PM notifications" ON public.pm_notifications;

-- profiles
DROP POLICY IF EXISTS "Operations roles can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles can be created on signup" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- service_schedules
DROP POLICY IF EXISTS "Owner safety can manage service schedules" ON public.service_schedules;
DROP POLICY IF EXISTS "Safety roles can view all service schedules" ON public.service_schedules;

-- settlement_line_items
DROP POLICY IF EXISTS "Owner payroll can manage line items" ON public.settlement_line_items;
DROP POLICY IF EXISTS "Users can view line items for their settlements" ON public.settlement_line_items;

-- settlements
DROP POLICY IF EXISTS "Drivers can view their own settlements" ON public.settlements;
DROP POLICY IF EXISTS "Owner payroll can manage settlements" ON public.settlements;
DROP POLICY IF EXISTS "Owner payroll can view all settlements" ON public.settlements;

-- trailer_assignments
DROP POLICY IF EXISTS "Admin roles can view all trailer assignments" ON public.trailer_assignments;
DROP POLICY IF EXISTS "Owner dispatcher can manage trailer assignments" ON public.trailer_assignments;

-- trailers
DROP POLICY IF EXISTS "Admin roles can view all trailers" ON public.trailers;
DROP POLICY IF EXISTS "Drivers can view their assigned trailer" ON public.trailers;
DROP POLICY IF EXISTS "Operations roles can view all trailers" ON public.trailers;
DROP POLICY IF EXISTS "Owner dispatcher safety can manage trailers" ON public.trailers;

-- trucks
DROP POLICY IF EXISTS "Admin roles can view all trucks" ON public.trucks;
DROP POLICY IF EXISTS "Drivers can view their assigned truck" ON public.trucks;
DROP POLICY IF EXISTS "Operations roles can view all trucks" ON public.trucks;
DROP POLICY IF EXISTS "Owner dispatcher safety can manage trucks" ON public.trucks;
DROP POLICY IF EXISTS "Safety roles can view all trucks" ON public.trucks;

-- user_roles
DROP POLICY IF EXISTS "Only owners can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- work_orders
DROP POLICY IF EXISTS "Admin roles can view all work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Owner safety can manage work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Safety roles can view all work orders" ON public.work_orders;


-- ==========================================
-- STEP 3: Enable RLS on newly-altered tables (idempotent)
-- ==========================================
ALTER TABLE public.load_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trailer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- STEP 4: Recreate ALL policies with org_id isolation
-- ==========================================

-- ==========================================
-- agency_loads
-- ==========================================
CREATE POLICY "Operations can view agency loads" ON public.agency_loads
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher can manage agency loads" ON public.agency_loads
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- agent_commissions
-- ==========================================
CREATE POLICY "Owner payroll can manage commissions" ON public.agent_commissions
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can view commissions" ON public.agent_commissions
  FOR SELECT USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  );

-- ==========================================
-- audit_logs
-- ==========================================
CREATE POLICY "Owners can view audit logs" ON public.audit_logs
  FOR SELECT USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- company_resources
-- ==========================================
CREATE POLICY "Operations can manage company resources" ON public.company_resources
  FOR ALL USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view company resources" ON public.company_resources
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- company_settings
-- ==========================================
CREATE POLICY "Admin roles can view settings" ON public.company_settings
  FOR SELECT USING (has_admin_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner can manage settings" ON public.company_settings
  FOR ALL USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- crm_activities
-- ==========================================
CREATE POLICY "Drivers can view CRM activities" ON public.crm_activities
  FOR SELECT USING (get_driver_id_for_user(auth.uid()) IS NOT NULL AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can manage CRM activities" ON public.crm_activities
  FOR ALL USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety can view CRM activities" ON public.crm_activities
  FOR SELECT USING (has_role(auth.uid(), 'safety'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- crm_contact_loads
-- ==========================================
CREATE POLICY "Drivers can view CRM contact loads" ON public.crm_contact_loads
  FOR SELECT USING (get_driver_id_for_user(auth.uid()) IS NOT NULL AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can manage CRM contact loads" ON public.crm_contact_loads
  FOR ALL USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety can view CRM contact loads" ON public.crm_contact_loads
  FOR SELECT USING (has_role(auth.uid(), 'safety'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- crm_contacts
-- ==========================================
CREATE POLICY "Drivers can view CRM contacts" ON public.crm_contacts
  FOR SELECT USING (get_driver_id_for_user(auth.uid()) IS NOT NULL AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can manage CRM contacts" ON public.crm_contacts
  FOR ALL USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety can view CRM contacts" ON public.crm_contacts
  FOR SELECT USING (has_role(auth.uid(), 'safety'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- detention_requests
-- ==========================================
CREATE POLICY "Drivers can insert detention requests" ON public.detention_requests
  FOR INSERT WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their detention requests" ON public.detention_requests
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view all detention requests" ON public.detention_requests
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher can manage detention requests" ON public.detention_requests
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- documents
-- ==========================================
CREATE POLICY "Operations can manage documents" ON public.documents
  FOR ALL USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view all documents" ON public.documents
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can upload their own documents" ON public.documents
  FOR INSERT WITH CHECK (uploaded_by = auth.uid() AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can view their own documents" ON public.documents
  FOR SELECT USING (uploaded_by = auth.uid() AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- driver_inspections
-- ==========================================
CREATE POLICY "Drivers can insert their own inspections" ON public.driver_inspections
  FOR INSERT WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their own inspections" ON public.driver_inspections
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner safety can manage inspections" ON public.driver_inspections
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view all inspections" ON public.driver_inspections
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- driver_locations
-- ==========================================
CREATE POLICY "Drivers can upsert their own location" ON public.driver_locations
  FOR ALL USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view sharing driver locations" ON public.driver_locations
  FOR SELECT USING (has_operations_access(auth.uid()) AND is_sharing = true AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- driver_notifications
-- ==========================================
CREATE POLICY "Drivers can delete their own notifications" ON public.driver_notifications
  FOR DELETE USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can update their own notifications" ON public.driver_notifications
  FOR UPDATE USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their own notifications" ON public.driver_notifications
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view all notifications" ON public.driver_notifications
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher can manage notifications" ON public.driver_notifications
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- driver_payroll
-- ==========================================
CREATE POLICY "Drivers can view their own payroll" ON public.driver_payroll
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can manage payroll" ON public.driver_payroll
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can view all payroll" ON public.driver_payroll
  FOR SELECT USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  );

-- ==========================================
-- driver_performance_metrics
-- ==========================================
CREATE POLICY "Drivers can view their own performance" ON public.driver_performance_metrics
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view all performance metrics" ON public.driver_performance_metrics
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner can manage performance metrics" ON public.driver_performance_metrics
  FOR ALL USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- driver_requests
-- ==========================================
CREATE POLICY "Drivers can insert their own requests" ON public.driver_requests
  FOR INSERT WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their own requests" ON public.driver_requests
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view all requests" ON public.driver_requests
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher can manage requests" ON public.driver_requests
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety can view all requests" ON public.driver_requests
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- driver_settings
-- ==========================================
CREATE POLICY "Drivers can insert their own settings" ON public.driver_settings
  FOR INSERT WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can update their own settings" ON public.driver_settings
  FOR UPDATE USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their own settings" ON public.driver_settings
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner can manage all driver settings" ON public.driver_settings
  FOR ALL USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- drivers
-- ==========================================
CREATE POLICY "Drivers can view their own record" ON public.drivers
  FOR SELECT USING (user_id = auth.uid() AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner and payroll can manage drivers" ON public.drivers
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Payroll roles can view all drivers" ON public.drivers
  FOR SELECT USING (has_payroll_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety role can view all drivers" ON public.drivers
  FOR SELECT USING (has_role(auth.uid(), 'safety'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- expenses
-- ==========================================
CREATE POLICY "Operations can view expenses" ON public.expenses
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can access expenses" ON public.expenses
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- facilities
-- ==========================================
CREATE POLICY "Drivers can view facilities" ON public.facilities
  FOR SELECT USING (get_driver_id_for_user(auth.uid()) IS NOT NULL AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can manage facilities" ON public.facilities
  FOR ALL USING (
    (has_operations_access(auth.uid()) OR is_owner(auth.uid()))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view facilities" ON public.facilities
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Payroll can view facilities" ON public.facilities
  FOR SELECT USING (has_payroll_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- fleet_loads
-- ==========================================
CREATE POLICY "Drivers can update status on their assigned loads" ON public.fleet_loads
  FOR UPDATE USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their assigned loads" ON public.fleet_loads
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view all fleet loads" ON public.fleet_loads
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher can manage fleet loads" ON public.fleet_loads
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- fuel_purchases
-- ==========================================
CREATE POLICY "Drivers can insert their own fuel purchases" ON public.fuel_purchases
  FOR INSERT WITH CHECK (
    (driver_id = get_driver_id_for_user(auth.uid()) OR has_admin_access(auth.uid()))
    AND org_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Drivers can view their own fuel purchases" ON public.fuel_purchases
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view fuel purchases" ON public.fuel_purchases
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can manage fuel purchases" ON public.fuel_purchases
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Payroll roles can view fuel purchases" ON public.fuel_purchases
  FOR SELECT USING (has_payroll_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- fuel_stops_cache
-- ==========================================
CREATE POLICY "Drivers can view fuel stops" ON public.fuel_stops_cache
  FOR SELECT USING (get_driver_id_for_user(auth.uid()) IS NOT NULL AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view fuel stops" ON public.fuel_stops_cache
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner can manage fuel stops" ON public.fuel_stops_cache
  FOR ALL USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- general_ledger
-- ==========================================
CREATE POLICY "Owner payroll can access ledger" ON public.general_ledger
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- hos_logs
-- ==========================================
CREATE POLICY "Drivers can manage their own HOS logs" ON public.hos_logs
  FOR ALL USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view all HOS logs" ON public.hos_logs
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner safety can manage HOS logs" ON public.hos_logs
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- ifta_records
-- ==========================================
CREATE POLICY "Owner payroll can manage IFTA records" ON public.ifta_records
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Payroll roles can view IFTA records" ON public.ifta_records
  FOR SELECT USING (has_payroll_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- incident_photos
-- ==========================================
CREATE POLICY "Drivers can insert photos for their incidents" ON public.incident_photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = incident_photos.incident_id
        AND (i.driver_id = get_driver_id_for_user(auth.uid()) OR has_admin_access(auth.uid()))
    )
    AND org_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Drivers can view photos for their incidents" ON public.incident_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = incident_photos.incident_id
        AND i.driver_id = get_driver_id_for_user(auth.uid())
    )
    AND org_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Owner safety can manage incident photos" ON public.incident_photos
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view all incident photos" ON public.incident_photos
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- incident_witnesses
-- ==========================================
CREATE POLICY "Drivers can insert witnesses for their incidents" ON public.incident_witnesses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = incident_witnesses.incident_id
        AND (i.driver_id = get_driver_id_for_user(auth.uid()) OR has_admin_access(auth.uid()))
    )
    AND org_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Owner safety can manage witnesses" ON public.incident_witnesses
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can delete witnesses" ON public.incident_witnesses
  FOR DELETE USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can insert witnesses" ON public.incident_witnesses
  FOR INSERT WITH CHECK (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can update witnesses" ON public.incident_witnesses
  FOR UPDATE USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view all witnesses" ON public.incident_witnesses
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- incidents
-- ==========================================
CREATE POLICY "Drivers can insert incidents" ON public.incidents
  FOR INSERT WITH CHECK (
    (driver_id = get_driver_id_for_user(auth.uid()) OR has_admin_access(auth.uid()))
    AND org_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Drivers can view their own incidents" ON public.incidents
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner safety can manage incidents" ON public.incidents
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view all incidents" ON public.incidents
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- inspection_photos
-- ==========================================
CREATE POLICY "Drivers can insert photos for their inspections" ON public.inspection_photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM driver_inspections di
      WHERE di.id = inspection_photos.inspection_id
        AND di.driver_id = get_driver_id_for_user(auth.uid())
    )
    AND org_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Drivers can view photos for their inspections" ON public.inspection_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM driver_inspections di
      WHERE di.id = inspection_photos.inspection_id
        AND di.driver_id = get_driver_id_for_user(auth.uid())
    )
    AND org_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Owner safety can manage inspection photos" ON public.inspection_photos
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view all inspection photos" ON public.inspection_photos
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- load_accessorials
-- ==========================================
CREATE POLICY "Operations can view all accessorials" ON public.load_accessorials
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher can manage accessorials" ON public.load_accessorials
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- load_expenses
-- ==========================================
CREATE POLICY "Operations can view all load expenses" ON public.load_expenses
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher can manage load expenses" ON public.load_expenses
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- load_status_logs (newly has org_id)
-- ==========================================
CREATE POLICY "Drivers can view status logs for their loads" ON public.load_status_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM fleet_loads fl
      WHERE fl.id = load_status_logs.load_id
        AND fl.driver_id = get_driver_id_for_user(auth.uid())
    )
    AND org_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Operations can view all status logs" ON public.load_status_logs
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher can manage status logs" ON public.load_status_logs
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- maintenance_logs (newly has org_id)
-- ==========================================
CREATE POLICY "Owner safety can manage maintenance" ON public.maintenance_logs
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view maintenance" ON public.maintenance_logs
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- maintenance_requests
-- ==========================================
CREATE POLICY "Drivers can insert maintenance requests" ON public.maintenance_requests
  FOR INSERT WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their own maintenance requests" ON public.maintenance_requests
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner safety can manage maintenance requests" ON public.maintenance_requests
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view all maintenance requests" ON public.maintenance_requests
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- manufacturer_pm_profiles (shared reference data - keep broad access but still scope management)
-- ==========================================
CREATE POLICY "Owner can manage manufacturer profiles" ON public.manufacturer_pm_profiles
  FOR ALL USING (is_owner(auth.uid())) WITH CHECK (true);

CREATE POLICY "Safety roles can view manufacturer profiles" ON public.manufacturer_pm_profiles
  FOR SELECT USING (has_safety_access(auth.uid()));

-- ==========================================
-- pm_notifications (newly has org_id)
-- ==========================================
CREATE POLICY "Safety roles can delete PM notifications" ON public.pm_notifications
  FOR DELETE USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can update PM notifications" ON public.pm_notifications
  FOR UPDATE USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view PM notifications" ON public.pm_notifications
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- profiles (special: users see own, admins see same-org)
-- ==========================================
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view org profiles" ON public.profiles
  FOR SELECT USING (has_admin_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view org profiles" ON public.profiles
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Profiles can be created on signup" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Owners can update org profiles" ON public.profiles
  FOR UPDATE USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- service_schedules (newly has org_id)
-- ==========================================
CREATE POLICY "Owner safety can manage service schedules" ON public.service_schedules
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view all service schedules" ON public.service_schedules
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- settlement_line_items
-- ==========================================
CREATE POLICY "Owner payroll can manage line items" ON public.settlement_line_items
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can view line items for their settlements" ON public.settlement_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM settlements s
      WHERE s.id = settlement_line_items.settlement_id
        AND s.driver_id = get_driver_id_for_user(auth.uid())
    )
    AND org_id = get_user_org_id(auth.uid())
  );

-- ==========================================
-- settlements
-- ==========================================
CREATE POLICY "Drivers can view their own settlements" ON public.settlements
  FOR SELECT USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can manage settlements" ON public.settlements
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can view all settlements" ON public.settlements
  FOR SELECT USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  );

-- ==========================================
-- trailer_assignments (newly has org_id)
-- ==========================================
CREATE POLICY "Admin roles can view all trailer assignments" ON public.trailer_assignments
  FOR SELECT USING (has_admin_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher can manage trailer assignments" ON public.trailer_assignments
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- trailers
-- ==========================================
CREATE POLICY "Admin roles can view all trailers" ON public.trailers
  FOR SELECT USING (has_admin_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their assigned trailer" ON public.trailers
  FOR SELECT USING (current_driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view all trailers" ON public.trailers
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher safety can manage trailers" ON public.trailers
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- trucks
-- ==========================================
CREATE POLICY "Admin roles can view all trucks" ON public.trucks
  FOR SELECT USING (has_admin_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Drivers can view their assigned truck" ON public.trucks
  FOR SELECT USING (current_driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view all trucks" ON public.trucks
  FOR SELECT USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner dispatcher safety can manage trucks" ON public.trucks
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view all trucks" ON public.trucks
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- user_roles (newly has org_id - cross-tenant role management prevention)
-- ==========================================
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Owners can view org roles" ON public.user_roles
  FOR SELECT USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owners can manage org roles" ON public.user_roles
  FOR ALL USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ==========================================
-- work_orders (newly has org_id)
-- ==========================================
CREATE POLICY "Admin roles can view all work orders" ON public.work_orders
  FOR SELECT USING (has_admin_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner safety can manage work orders" ON public.work_orders
  FOR ALL USING (
    (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role))
    AND org_id = get_user_org_id(auth.uid())
  ) WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety roles can view all work orders" ON public.work_orders
  FOR SELECT USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

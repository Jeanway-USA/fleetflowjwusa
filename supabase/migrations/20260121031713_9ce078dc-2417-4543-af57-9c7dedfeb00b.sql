-- Create granular access control functions

-- Payroll Access: Owners and Payroll Admins
CREATE OR REPLACE FUNCTION public.has_payroll_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'payroll_admin')
  )
$$;

-- Operations Access: Owners and Dispatchers
CREATE OR REPLACE FUNCTION public.has_operations_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'dispatcher')
  )
$$;

-- Safety Access: Owners and Dispatchers (as specified)
CREATE OR REPLACE FUNCTION public.has_safety_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'dispatcher')
  )
$$;

-- Update RLS policies to use granular functions

-- agency_loads: Operations access
DROP POLICY IF EXISTS "Admin roles can view all agency loads" ON public.agency_loads;
CREATE POLICY "Operations roles can view all agency loads" 
ON public.agency_loads 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- company_resources: Operations access for viewing
DROP POLICY IF EXISTS "Authenticated users can view company resources" ON public.company_resources;
DROP POLICY IF EXISTS "Admin roles can delete company resources" ON public.company_resources;
DROP POLICY IF EXISTS "Admin roles can insert company resources" ON public.company_resources;
DROP POLICY IF EXISTS "Admin roles can update company resources" ON public.company_resources;

CREATE POLICY "Authenticated users can view company resources" 
ON public.company_resources 
FOR SELECT 
USING (true);

CREATE POLICY "Operations roles can manage company resources" 
ON public.company_resources 
FOR ALL 
USING (has_operations_access(auth.uid()));

-- documents: Operations access
DROP POLICY IF EXISTS "Admin roles can manage documents" ON public.documents;
DROP POLICY IF EXISTS "Admin roles can view all documents" ON public.documents;

CREATE POLICY "Operations roles can manage documents" 
ON public.documents 
FOR ALL 
USING (has_operations_access(auth.uid()));

CREATE POLICY "Operations roles can view all documents" 
ON public.documents 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- driver_inspections: Safety access
DROP POLICY IF EXISTS "Admin roles can view all inspections" ON public.driver_inspections;
CREATE POLICY "Safety roles can view all inspections" 
ON public.driver_inspections 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- driver_locations: Operations access
DROP POLICY IF EXISTS "Admin roles can view all driver locations" ON public.driver_locations;
CREATE POLICY "Operations roles can view all driver locations" 
ON public.driver_locations 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- driver_notifications: Operations access
DROP POLICY IF EXISTS "Admin roles can view all notifications" ON public.driver_notifications;
CREATE POLICY "Operations roles can view all notifications" 
ON public.driver_notifications 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- driver_payroll: Payroll access (already uses owner/payroll, keep separate)
-- No change needed - already uses is_owner OR has_role payroll_admin

-- driver_performance_metrics: Operations access for viewing
DROP POLICY IF EXISTS "Admin roles can view all performance metrics" ON public.driver_performance_metrics;
CREATE POLICY "Operations roles can view all performance metrics" 
ON public.driver_performance_metrics 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- driver_settings: Operations access
DROP POLICY IF EXISTS "Admin roles can view all driver settings" ON public.driver_settings;
CREATE POLICY "Operations roles can view all driver settings" 
ON public.driver_settings 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- drivers: Payroll access for management, Operations for viewing
DROP POLICY IF EXISTS "Admin roles can view all drivers" ON public.drivers;
CREATE POLICY "Payroll roles can view all drivers" 
ON public.drivers 
FOR SELECT 
USING (has_payroll_access(auth.uid()));

CREATE POLICY "Operations roles can view all drivers" 
ON public.drivers 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- expenses: Payroll access
DROP POLICY IF EXISTS "Dispatcher can view expenses" ON public.expenses;
CREATE POLICY "Operations roles can view expenses" 
ON public.expenses 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- fleet_loads: Operations access
DROP POLICY IF EXISTS "Admin roles can view all fleet loads" ON public.fleet_loads;
CREATE POLICY "Operations roles can view all fleet loads" 
ON public.fleet_loads 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- fuel_purchases: Payroll access for viewing
DROP POLICY IF EXISTS "Admin roles can view fuel purchases" ON public.fuel_purchases;
CREATE POLICY "Payroll roles can view fuel purchases" 
ON public.fuel_purchases 
FOR SELECT 
USING (has_payroll_access(auth.uid()));

-- Also allow operations to view for load planning
CREATE POLICY "Operations roles can view fuel purchases" 
ON public.fuel_purchases 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- ifta_records: Payroll access
DROP POLICY IF EXISTS "Admin roles can view IFTA records" ON public.ifta_records;
CREATE POLICY "Payroll roles can view IFTA records" 
ON public.ifta_records 
FOR SELECT 
USING (has_payroll_access(auth.uid()));

-- incident_photos: Safety access
DROP POLICY IF EXISTS "Admin roles can view all incident photos" ON public.incident_photos;
CREATE POLICY "Safety roles can view all incident photos" 
ON public.incident_photos 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- incident_witnesses: Safety access
DROP POLICY IF EXISTS "Admin roles can view all witnesses" ON public.incident_witnesses;
CREATE POLICY "Safety roles can view all witnesses" 
ON public.incident_witnesses 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- incidents: Safety access
DROP POLICY IF EXISTS "Admin roles can view all incidents" ON public.incidents;
CREATE POLICY "Safety roles can view all incidents" 
ON public.incidents 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- inspection_photos: Safety access
DROP POLICY IF EXISTS "Admin roles can view all inspection photos" ON public.inspection_photos;
CREATE POLICY "Safety roles can view all inspection photos" 
ON public.inspection_photos 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- load_accessorials: Operations access
DROP POLICY IF EXISTS "Admin roles can view all accessorials" ON public.load_accessorials;
CREATE POLICY "Operations roles can view all accessorials" 
ON public.load_accessorials 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- load_expenses: Operations access
DROP POLICY IF EXISTS "Admin roles can view all load expenses" ON public.load_expenses;
CREATE POLICY "Operations roles can view all load expenses" 
ON public.load_expenses 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- load_status_logs: Operations access
DROP POLICY IF EXISTS "Admin roles can view all status logs" ON public.load_status_logs;
CREATE POLICY "Operations roles can view all status logs" 
ON public.load_status_logs 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- maintenance_logs: Safety access
DROP POLICY IF EXISTS "Admin roles can view maintenance" ON public.maintenance_logs;
CREATE POLICY "Safety roles can view maintenance" 
ON public.maintenance_logs 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- maintenance_requests: Safety access
DROP POLICY IF EXISTS "Admin roles can view all maintenance requests" ON public.maintenance_requests;
CREATE POLICY "Safety roles can view all maintenance requests" 
ON public.maintenance_requests 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- manufacturer_pm_profiles: Safety access
DROP POLICY IF EXISTS "Admin roles can view manufacturer profiles" ON public.manufacturer_pm_profiles;
CREATE POLICY "Safety roles can view manufacturer profiles" 
ON public.manufacturer_pm_profiles 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- pm_notifications: Safety access
DROP POLICY IF EXISTS "Admin users can view PM notifications" ON public.pm_notifications;
DROP POLICY IF EXISTS "Admin users can update PM notifications" ON public.pm_notifications;
DROP POLICY IF EXISTS "Admin users can delete PM notifications" ON public.pm_notifications;

CREATE POLICY "Safety roles can view PM notifications" 
ON public.pm_notifications 
FOR SELECT 
USING (has_safety_access(auth.uid()));

CREATE POLICY "Safety roles can update PM notifications" 
ON public.pm_notifications 
FOR UPDATE 
USING (has_safety_access(auth.uid()));

CREATE POLICY "Safety roles can delete PM notifications" 
ON public.pm_notifications 
FOR DELETE 
USING (has_safety_access(auth.uid()));

-- profiles: Keep existing, add operations access for viewing
CREATE POLICY "Operations roles can view profiles" 
ON public.profiles 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- service_schedules: Safety access
DROP POLICY IF EXISTS "Admin roles can view all service schedules" ON public.service_schedules;
CREATE POLICY "Safety roles can view all service schedules" 
ON public.service_schedules 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- trucks: Operations and Safety access
CREATE POLICY "Operations roles can view all trucks" 
ON public.trucks 
FOR SELECT 
USING (has_operations_access(auth.uid()));

CREATE POLICY "Safety roles can view all trucks" 
ON public.trucks 
FOR SELECT 
USING (has_safety_access(auth.uid()));

-- trailers: Operations access
CREATE POLICY "Operations roles can view all trailers" 
ON public.trailers 
FOR SELECT 
USING (has_operations_access(auth.uid()));

-- work_orders: Safety access
CREATE POLICY "Safety roles can view all work orders" 
ON public.work_orders 
FOR SELECT 
USING (has_safety_access(auth.uid()));
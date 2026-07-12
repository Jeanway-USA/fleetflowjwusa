
-- fleet_loads
DROP POLICY IF EXISTS "Owner dispatcher can manage fleet loads" ON public.fleet_loads;
CREATE POLICY "Owner dispatcher can manage fleet loads" ON public.fleet_loads
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- driver_settlement_items
DROP POLICY IF EXISTS "Owner payroll can manage driver settlement items" ON public.driver_settlement_items;
CREATE POLICY "Owner payroll can manage driver settlement items" ON public.driver_settlement_items
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- settlement_line_items
DROP POLICY IF EXISTS "Owner payroll can manage line items" ON public.settlement_line_items;
CREATE POLICY "Owner payroll can manage line items" ON public.settlement_line_items
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- driver_requests
DROP POLICY IF EXISTS "Owner dispatcher can manage requests" ON public.driver_requests;
CREATE POLICY "Owner dispatcher can manage requests" ON public.driver_requests
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- trailer_assignments
DROP POLICY IF EXISTS "Owner dispatcher can manage trailer assignments" ON public.trailer_assignments;
CREATE POLICY "Owner dispatcher can manage trailer assignments" ON public.trailer_assignments
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- load_accessorials
DROP POLICY IF EXISTS "Owner dispatcher can manage accessorials" ON public.load_accessorials;
CREATE POLICY "Owner dispatcher can manage accessorials" ON public.load_accessorials
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- load_status_logs
DROP POLICY IF EXISTS "Owner dispatcher can manage status logs" ON public.load_status_logs;
CREATE POLICY "Owner dispatcher can manage status logs" ON public.load_status_logs
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- detention_requests
DROP POLICY IF EXISTS "Owner dispatcher can manage detention requests" ON public.detention_requests;
CREATE POLICY "Owner dispatcher can manage detention requests" ON public.detention_requests
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- driver_notifications
DROP POLICY IF EXISTS "Owner dispatcher can manage notifications" ON public.driver_notifications;
CREATE POLICY "Owner dispatcher can manage notifications" ON public.driver_notifications
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- incident_witnesses
DROP POLICY IF EXISTS "Owner safety can manage witnesses" ON public.incident_witnesses;
CREATE POLICY "Owner safety can manage witnesses" ON public.incident_witnesses
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- maintenance_requests
DROP POLICY IF EXISTS "Owner safety can manage maintenance requests" ON public.maintenance_requests;
CREATE POLICY "Owner safety can manage maintenance requests" ON public.maintenance_requests
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- incident_photos
DROP POLICY IF EXISTS "Owner safety can manage incident photos" ON public.incident_photos;
CREATE POLICY "Owner safety can manage incident photos" ON public.incident_photos
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- service_schedules
DROP POLICY IF EXISTS "Owner safety can manage service schedules" ON public.service_schedules;
CREATE POLICY "Owner safety can manage service schedules" ON public.service_schedules
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

-- maintenance_logs
DROP POLICY IF EXISTS "Owner safety can manage maintenance" ON public.maintenance_logs;
CREATE POLICY "Owner safety can manage maintenance" ON public.maintenance_logs
  AS PERMISSIVE FOR ALL TO public
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND (org_id = get_user_org_id(auth.uid())));

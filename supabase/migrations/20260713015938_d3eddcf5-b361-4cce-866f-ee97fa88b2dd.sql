
DROP POLICY "Owner can manage settings" ON public.company_settings;
CREATE POLICY "Owner can manage settings" ON public.company_settings
  FOR ALL TO authenticated
  USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

DROP POLICY "Owner and payroll can manage drivers" ON public.drivers;
CREATE POLICY "Owner and payroll can manage drivers" ON public.drivers
  FOR ALL TO authenticated
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

DROP POLICY "Owner payroll can manage IFTA records" ON public.ifta_records;
CREATE POLICY "Owner payroll can manage IFTA records" ON public.ifta_records
  FOR ALL TO authenticated
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

DROP POLICY "Owners can manage their storage config" ON public.org_storage_config;
CREATE POLICY "Owners can manage their storage config" ON public.org_storage_config
  FOR ALL TO authenticated
  USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

DROP POLICY "Maintenance roles can manage parts inventory" ON public.parts_inventory;
CREATE POLICY "Maintenance roles can manage parts inventory" ON public.parts_inventory
  FOR ALL TO authenticated
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'maintenance'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'maintenance'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND org_id = get_user_org_id(auth.uid()));

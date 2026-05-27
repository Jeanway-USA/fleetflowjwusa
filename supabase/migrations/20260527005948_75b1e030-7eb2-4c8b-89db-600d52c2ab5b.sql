CREATE POLICY "Maintenance role can view work orders"
  ON public.work_orders FOR SELECT
  USING (has_role(auth.uid(), 'maintenance'::app_role)
         AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Maintenance role can insert work orders"
  ON public.work_orders FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role)
              AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Maintenance role can update work orders"
  ON public.work_orders FOR UPDATE
  USING (has_role(auth.uid(), 'maintenance'::app_role)
         AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));
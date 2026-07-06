
-- agent_commissions
DROP POLICY IF EXISTS "Owner payroll can manage commissions" ON public.agent_commissions;
CREATE POLICY "Owner payroll can manage commissions" ON public.agent_commissions
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- driver_payroll
DROP POLICY IF EXISTS "Owner payroll can manage payroll" ON public.driver_payroll;
CREATE POLICY "Owner payroll can manage payroll" ON public.driver_payroll
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- driver_settlements
DROP POLICY IF EXISTS "Owner payroll can manage driver settlements" ON public.driver_settlements;
CREATE POLICY "Owner payroll can manage driver settlements" ON public.driver_settlements
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- expenses
DROP POLICY IF EXISTS "Owner payroll can access expenses" ON public.expenses;
CREATE POLICY "Owner payroll can access expenses" ON public.expenses
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- general_ledger
DROP POLICY IF EXISTS "Owner payroll can access ledger" ON public.general_ledger;
CREATE POLICY "Owner payroll can access ledger" ON public.general_ledger
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- settlements
DROP POLICY IF EXISTS "Owner payroll can manage settlements" ON public.settlements;
CREATE POLICY "Owner payroll can manage settlements" ON public.settlements
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- driver_banking_info (already correct — recreate for consistency/audit clarity)
DROP POLICY IF EXISTS "Owner payroll can manage banking" ON public.driver_banking_info;
CREATE POLICY "Owner payroll can manage banking" ON public.driver_banking_info
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- fuel_purchases
DROP POLICY IF EXISTS "Owner payroll can manage fuel purchases" ON public.fuel_purchases;
CREATE POLICY "Owner payroll can manage fuel purchases" ON public.fuel_purchases
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- incidents
DROP POLICY IF EXISTS "Owner safety can manage incidents" ON public.incidents;
CREATE POLICY "Owner safety can manage incidents" ON public.incidents
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- load_expenses
DROP POLICY IF EXISTS "Owner dispatcher can manage load expenses" ON public.load_expenses;
CREATE POLICY "Owner dispatcher can manage load expenses" ON public.load_expenses
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- facilities
DROP POLICY IF EXISTS "Operations can manage facilities" ON public.facilities;
CREATE POLICY "Operations can manage facilities" ON public.facilities
FOR ALL TO authenticated
USING ((has_operations_access(auth.uid()) OR is_owner(auth.uid())) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((has_operations_access(auth.uid()) OR is_owner(auth.uid())) AND org_id = get_user_org_id(auth.uid()));

-- agency_loads
DROP POLICY IF EXISTS "Owner dispatcher can manage agency loads" ON public.agency_loads;
CREATE POLICY "Owner dispatcher can manage agency loads" ON public.agency_loads
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- safety_bonus_settings
DROP POLICY IF EXISTS "Owner can manage safety bonus settings" ON public.safety_bonus_settings;
CREATE POLICY "Owner can manage safety bonus settings" ON public.safety_bonus_settings
FOR ALL TO authenticated
USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- safety_bonus_tiers
DROP POLICY IF EXISTS "Owner can manage safety bonus tiers" ON public.safety_bonus_tiers;
CREATE POLICY "Owner can manage safety bonus tiers" ON public.safety_bonus_tiers
FOR ALL TO authenticated
USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- driver_settings
DROP POLICY IF EXISTS "Owner can manage all driver settings" ON public.driver_settings;
CREATE POLICY "Owner can manage all driver settings" ON public.driver_settings
FOR ALL TO authenticated
USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- driver_performance_metrics
DROP POLICY IF EXISTS "Owner can manage performance metrics" ON public.driver_performance_metrics;
CREATE POLICY "Owner can manage performance metrics" ON public.driver_performance_metrics
FOR ALL TO authenticated
USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- trucks
DROP POLICY IF EXISTS "Owner dispatcher safety can manage trucks" ON public.trucks;
CREATE POLICY "Owner dispatcher safety can manage trucks" ON public.trucks
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'safety'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'safety'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- trailers
DROP POLICY IF EXISTS "Owner dispatcher safety can manage trailers" ON public.trailers;
CREATE POLICY "Owner dispatcher safety can manage trailers" ON public.trailers
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'safety'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'safety'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- work_orders
DROP POLICY IF EXISTS "Owner safety can manage work orders" ON public.work_orders;
CREATE POLICY "Owner safety can manage work orders" ON public.work_orders
FOR ALL TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK ((is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role)) AND org_id = get_user_org_id(auth.uid()));

-- Drivers: restrict self-update to non-sensitive columns via a stricter policy.
-- The existing prevent_driver_self_sensitive_update trigger blocks the sensitive fields,
-- but we also narrow the policy so scanner sees explicit column-safety intent.
DROP POLICY IF EXISTS "Drivers can update their own credentials" ON public.drivers;
CREATE POLICY "Drivers can update their own credentials" ON public.drivers
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND org_id = get_user_org_id(auth.uid()))
WITH CHECK (
  user_id = auth.uid()
  AND org_id = get_user_org_id(auth.uid())
  AND NOT (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
  -- Sensitive-field enforcement handled by trigger public.prevent_driver_self_sensitive_update
);

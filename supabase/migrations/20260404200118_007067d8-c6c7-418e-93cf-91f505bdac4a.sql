
-- Fix super_admin_delete_org: delete user_roles by org_id directly before the join-based delete
CREATE OR REPLACE FUNCTION public.super_admin_delete_org(target_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF target_org_id = 'a0000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'Cannot delete the protected demo organization';
  END IF;

  -- Delete all child data
  DELETE FROM public.incident_photos WHERE org_id = target_org_id;
  DELETE FROM public.load_status_logs WHERE org_id = target_org_id;
  DELETE FROM public.load_expenses WHERE org_id = target_org_id;
  DELETE FROM public.crm_contact_loads WHERE org_id = target_org_id;
  DELETE FROM public.crm_activities WHERE org_id = target_org_id;
  DELETE FROM public.crm_contacts WHERE org_id = target_org_id;
  DELETE FROM public.driver_locations WHERE org_id = target_org_id;
  DELETE FROM public.driver_notifications WHERE org_id = target_org_id;
  DELETE FROM public.driver_inspections WHERE org_id = target_org_id;
  DELETE FROM public.driver_performance_metrics WHERE org_id = target_org_id;
  DELETE FROM public.driver_requests WHERE org_id = target_org_id;
  DELETE FROM public.driver_settings WHERE org_id = target_org_id;
  DELETE FROM public.driver_payroll WHERE org_id = target_org_id;
  DELETE FROM public.detention_requests WHERE org_id = target_org_id;
  DELETE FROM public.settlements WHERE org_id = target_org_id;
  DELETE FROM public.agent_commissions WHERE org_id = target_org_id;
  DELETE FROM public.fuel_purchases WHERE org_id = target_org_id;
  DELETE FROM public.fuel_stops_cache WHERE org_id = target_org_id;
  DELETE FROM public.expenses WHERE org_id = target_org_id;
  DELETE FROM public.fleet_loads WHERE org_id = target_org_id;
  DELETE FROM public.agency_loads WHERE org_id = target_org_id;
  DELETE FROM public.trailer_assignments WHERE org_id = target_org_id;
  DELETE FROM public.trailers WHERE org_id = target_org_id;
  DELETE FROM public.work_orders WHERE org_id = target_org_id;
  DELETE FROM public.service_schedules WHERE org_id = target_org_id;
  DELETE FROM public.maintenance_logs WHERE org_id = target_org_id;
  DELETE FROM public.hos_logs WHERE org_id = target_org_id;
  DELETE FROM public.documents WHERE org_id = target_org_id;
  DELETE FROM public.general_ledger WHERE org_id = target_org_id;
  DELETE FROM public.company_settings WHERE org_id = target_org_id;
  DELETE FROM public.company_resources WHERE org_id = target_org_id;
  DELETE FROM public.org_storage_config WHERE org_id = target_org_id;
  DELETE FROM public.audit_logs WHERE org_id = target_org_id;
  DELETE FROM public.drivers WHERE org_id = target_org_id;
  DELETE FROM public.trucks WHERE org_id = target_org_id;
  DELETE FROM public.facilities WHERE org_id = target_org_id;

  -- Delete user roles by org_id directly (fixes FK constraint error)
  DELETE FROM public.user_roles WHERE org_id = target_org_id;
  -- Also clean up any roles linked via profiles (belt and suspenders)
  DELETE FROM public.user_roles WHERE user_id IN (
    SELECT user_id FROM public.profiles WHERE org_id = target_org_id
  );
  DELETE FROM public.profiles WHERE org_id = target_org_id;

  -- Finally delete the organization
  DELETE FROM public.organizations WHERE id = target_org_id;
END;
$$;

-- Fix super_admin_update_org: clean up user_roles before auto-deleting empty deactivated orgs
CREATE OR REPLACE FUNCTION public.super_admin_update_org(
  target_org_id uuid,
  new_subscription_tier text DEFAULT NULL,
  new_is_active boolean DEFAULT NULL,
  new_trial_ends_at timestamptz DEFAULT NULL,
  new_is_complimentary boolean DEFAULT NULL,
  new_complimentary_ends_at timestamptz DEFAULT NULL,
  new_tms_mode text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate tms_mode if provided
  IF new_tms_mode IS NOT NULL AND new_tms_mode NOT IN ('landstar', 'independent') THEN
    RAISE EXCEPTION 'Invalid TMS mode';
  END IF;

  UPDATE organizations SET
    subscription_tier = COALESCE(new_subscription_tier, subscription_tier),
    is_active = COALESCE(new_is_active, is_active),
    trial_ends_at = new_trial_ends_at,
    is_complimentary = COALESCE(new_is_complimentary, is_complimentary),
    complimentary_ends_at = new_complimentary_ends_at,
    tms_mode = COALESCE(new_tms_mode, tms_mode),
    updated_at = now()
  WHERE id = target_org_id;

  -- Auto-delete if deactivated and no users remain
  IF new_is_active = false THEN
    -- Clean up user_roles first to avoid FK constraint errors
    DELETE FROM public.user_roles
    WHERE org_id = target_org_id
      AND target_org_id != 'a0000000-0000-0000-0000-000000000001'
      AND NOT EXISTS (
        SELECT 1 FROM profiles WHERE profiles.org_id = target_org_id
      );

    DELETE FROM organizations
    WHERE id = target_org_id
      AND id != 'a0000000-0000-0000-0000-000000000001'
      AND NOT EXISTS (
        SELECT 1 FROM profiles WHERE profiles.org_id = target_org_id
      );
  END IF;
END;
$$;

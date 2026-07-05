
-- Phase 1: Purge all non-JeanWay data. JeanWay org_id: a0000000-0000-0000-0000-000000000001
-- Suppress audit + FK-cascade triggers during purge.
SET session_replication_role = replica;

DO $$
DECLARE
  jeanway constant uuid := 'a0000000-0000-0000-0000-000000000001';
  tbl text;
  tables_with_org_id text[] := ARRAY[
    'incident_photos','incident_witnesses','load_status_logs','load_expenses',
    'load_accessorials','load_intermediate_stops','crm_contact_loads','crm_activities',
    'crm_contacts','driver_locations','driver_notifications','driver_performance_metrics',
    'driver_requests','driver_settings','driver_payroll','driver_settlement_items',
    'driver_settlements','driver_signed_documents','driver_banking_info','driver_w4_info',
    'driver_i9_info','driver_w9_info','driver_ioo_agreement','driver_inspections',
    'detention_requests','detention_rules','settlements','settlement_line_items',
    'settlement_discrepancies','agent_commissions','fuel_purchases','expenses',
    'fleet_loads','agency_loads','trailer_assignments','trailers','work_orders',
    'service_schedules','maintenance_logs','maintenance_requests','maintenance_request_messages',
    'pm_notifications','manufacturer_pm_profiles','parts_inventory','ifta_records',
    'over_dimension_rules','accessorial_types','safety_bonus_settings','safety_bonus_tiers',
    'payroll_settings','tax_documents','truck_loan_payments','incidents','hos_logs',
    'facilities','truck_stops','documents','document_templates','general_ledger',
    'company_settings','company_resources','org_storage_config','audit_logs',
    'drivers','trucks','driver_i9_info','driver_w9_info','driver_ioo_agreement',
    'lease_purchase_agreements','messages','user_feedback','gusto_integration',
    'invitations','user_roles'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_org_id LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=tbl AND column_name='org_id'
    ) THEN
      EXECUTE format('DELETE FROM public.%I WHERE org_id IS DISTINCT FROM %L', tbl, jeanway);
    END IF;
  END LOOP;

  -- profiles: keep only JeanWay profiles
  DELETE FROM public.profiles WHERE org_id IS DISTINCT FROM jeanway;

  -- user_roles: drop rows whose user has no remaining profile (belt & suspenders)
  DELETE FROM public.user_roles
   WHERE user_id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL);

  -- super_admins: drop everyone since super-admin concept is being removed
  DELETE FROM public.super_admins;

  -- Drop all non-JeanWay organizations
  DELETE FROM public.organizations WHERE id <> jeanway;

  -- Delete auth.users for anyone with no remaining profile
  DELETE FROM auth.users
   WHERE id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL);
END $$;

-- Collapse JeanWay roles: every 'owner' becomes 'admin'.
-- app_role enum already has 'admin'? Verify by adding it if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
  END IF;
END $$;

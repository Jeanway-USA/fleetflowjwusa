
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'expenses','load_expenses','fuel_purchases','settlements','driver_settlement_items',
    'agent_commissions','truck_loan_payments',
    'drivers','user_roles','invitations','driver_banking_info',
    'trailers','trailer_assignments',
    'work_orders','maintenance_requests','service_schedules','parts_inventory',
    'load_intermediate_stops','load_accessorials','detention_requests','driver_requests','documents',
    'incidents','incident_witnesses',
    'company_settings','org_storage_config','document_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()',
      t, t
    );
  END LOOP;
END $$;

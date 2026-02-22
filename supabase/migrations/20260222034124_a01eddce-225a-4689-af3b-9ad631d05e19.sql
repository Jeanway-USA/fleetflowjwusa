
-- A. Update super_admin_update_org to accept trial_ends_at
CREATE OR REPLACE FUNCTION public.super_admin_update_org(
  target_org_id uuid,
  new_tier text DEFAULT NULL,
  new_is_active boolean DEFAULT NULL,
  new_trial_ends_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE organizations SET
    subscription_tier = COALESCE(new_tier, subscription_tier),
    is_active = COALESCE(new_is_active, is_active),
    trial_ends_at = COALESCE(new_trial_ends_at, trial_ends_at),
    updated_at = now()
  WHERE id = target_org_id;
END;
$$;

-- B. New RPC: super_admin_get_owner_email
CREATE OR REPLACE FUNCTION public.super_admin_get_owner_email(target_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.email FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.user_id
  WHERE p.org_id = target_org_id AND ur.role = 'owner'
  LIMIT 1;
$$;

-- C. New View: super_admin_usage_metrics
CREATE OR REPLACE VIEW public.super_admin_usage_metrics AS
SELECT
  (SELECT count(*) FROM fleet_loads)::int AS total_fleet_loads,
  (SELECT count(*) FROM agency_loads)::int AS total_agency_loads,
  (SELECT count(*) FROM trucks)::int AS total_trucks,
  (SELECT count(*) FROM trailers)::int AS total_trailers,
  (SELECT count(*) FROM drivers)::int AS total_drivers,
  (SELECT coalesce(json_agg(row_to_json(d)), '[]'::json) FROM (
    SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS count
    FROM fleet_loads
    WHERE created_at >= now() - interval '30 days'
    GROUP BY 1 ORDER BY 1
  ) d) AS loads_per_day_30d;

-- RLS on the view via grant + is_super_admin check in queries
GRANT SELECT ON public.super_admin_usage_metrics TO authenticated;
REVOKE ALL ON public.super_admin_usage_metrics FROM anon;

-- D. New RPC: super_admin_storage_stats
CREATE OR REPLACE FUNCTION public.super_admin_storage_stats()
RETURNS TABLE(bucket_id text, file_count bigint, total_bytes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    o.bucket_id,
    count(*)::bigint AS file_count,
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint AS total_bytes
  FROM storage.objects o
  GROUP BY o.bucket_id;
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_storage_stats() TO authenticated;
REVOKE ALL ON FUNCTION public.super_admin_storage_stats() FROM anon;

-- E. New RPC: super_admin_reset_demo
CREATE OR REPLACE FUNCTION public.super_admin_reset_demo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  demo_org_id uuid;
  demo_user_id uuid;
  t1 uuid; t2 uuid; t3 uuid;
  d1 uuid; d2 uuid; d3 uuid;
  al1 uuid; al2 uuid; al3 uuid;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Find demo org
  SELECT p.org_id, p.user_id INTO demo_org_id, demo_user_id
  FROM profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE u.email = 'demo@fleetflow-tms.com'
  LIMIT 1;

  IF demo_org_id IS NULL THEN RAISE EXCEPTION 'Demo organization not found'; END IF;

  -- Delete all data for demo org (order matters for FK constraints)
  DELETE FROM agent_commissions WHERE org_id = demo_org_id;
  DELETE FROM load_status_logs WHERE org_id = demo_org_id;
  DELETE FROM driver_locations WHERE org_id = demo_org_id;
  DELETE FROM driver_notifications WHERE org_id = demo_org_id;
  DELETE FROM driver_inspections WHERE org_id = demo_org_id;
  DELETE FROM detention_requests WHERE org_id = demo_org_id;
  DELETE FROM driver_requests WHERE org_id = demo_org_id;
  DELETE FROM maintenance_requests WHERE org_id = demo_org_id;
  DELETE FROM driver_performance_metrics WHERE org_id = demo_org_id;
  DELETE FROM hos_logs WHERE org_id = demo_org_id;
  DELETE FROM driver_payroll WHERE org_id = demo_org_id;
  DELETE FROM crm_activities WHERE org_id = demo_org_id;
  DELETE FROM crm_contact_loads WHERE org_id = demo_org_id;
  DELETE FROM fuel_purchases WHERE org_id = demo_org_id;
  DELETE FROM expenses WHERE org_id = demo_org_id;
  DELETE FROM fleet_loads WHERE org_id = demo_org_id;
  DELETE FROM agency_loads WHERE org_id = demo_org_id;
  DELETE FROM work_orders WHERE org_id = demo_org_id;
  DELETE FROM maintenance_logs WHERE org_id = demo_org_id;
  DELETE FROM service_schedules WHERE org_id = demo_org_id;
  DELETE FROM ifta_records WHERE org_id = demo_org_id;
  DELETE FROM driver_settings WHERE org_id = demo_org_id;
  DELETE FROM crm_contacts WHERE org_id = demo_org_id;
  DELETE FROM trailer_assignments WHERE org_id = demo_org_id;
  DELETE FROM trailers WHERE org_id = demo_org_id;
  DELETE FROM drivers WHERE org_id = demo_org_id;
  DELETE FROM trucks WHERE org_id = demo_org_id;
  DELETE FROM documents WHERE org_id = demo_org_id;
  DELETE FROM general_ledger WHERE org_id = demo_org_id;
  DELETE FROM company_settings WHERE org_id = demo_org_id;
  DELETE FROM company_resources WHERE org_id = demo_org_id;
  DELETE FROM facilities WHERE org_id = demo_org_id;
  DELETE FROM incident_witnesses WHERE org_id = demo_org_id;
  DELETE FROM audit_logs WHERE org_id = demo_org_id;

  -- Reset org tier
  UPDATE organizations SET subscription_tier = 'all_in_one', is_active = true, updated_at = now() WHERE id = demo_org_id;

  -- Re-seed trucks
  INSERT INTO trucks (unit_number, make, model, year, vin, status, org_id) VALUES
    ('T-101', 'Freightliner', 'Cascadia', 2022, 'DEMO1234567890001', 'active', demo_org_id) RETURNING id INTO t1;
  INSERT INTO trucks (unit_number, make, model, year, vin, status, org_id) VALUES
    ('T-102', 'Kenworth', 'T680', 2023, 'DEMO1234567890002', 'active', demo_org_id) RETURNING id INTO t2;
  INSERT INTO trucks (unit_number, make, model, year, vin, status, org_id) VALUES
    ('T-103', 'Peterbilt', '579', 2021, 'DEMO1234567890003', 'in_shop', demo_org_id) RETURNING id INTO t3;

  -- Re-seed drivers
  INSERT INTO drivers (first_name, last_name, email, phone, status, pay_type, pay_rate, org_id) VALUES
    ('Mike', 'Johnson', 'mike@demo.com', '555-0101', 'active', 'percentage', 75, demo_org_id) RETURNING id INTO d1;
  INSERT INTO drivers (first_name, last_name, email, phone, status, pay_type, pay_rate, org_id) VALUES
    ('Sarah', 'Williams', 'sarah@demo.com', '555-0102', 'active', 'percentage', 72, demo_org_id) RETURNING id INTO d2;
  INSERT INTO drivers (first_name, last_name, email, phone, status, pay_type, pay_rate, org_id) VALUES
    ('Carlos', 'Rodriguez', 'carlos@demo.com', '555-0103', 'on_leave', 'per_mile', 0.65, demo_org_id) RETURNING id INTO d3;

  -- Re-seed fleet loads
  INSERT INTO fleet_loads (origin, destination, rate, status, pickup_date, delivery_date, driver_id, truck_id, booked_miles, actual_miles, gross_revenue, net_revenue, org_id) VALUES
    ('Dallas, TX', 'Houston, TX', 2200, 'delivered', '2026-02-01', '2026-02-02', d1, t1, 240, 245, 2200, 1870, demo_org_id),
    ('Atlanta, GA', 'Nashville, TN', 1800, 'delivered', '2026-02-03', '2026-02-04', d2, t2, 250, 255, 1800, 1530, demo_org_id),
    ('Chicago, IL', 'Indianapolis, IN', 1500, 'in_transit', '2026-02-10', NULL, d1, t1, 180, NULL, NULL, NULL, demo_org_id),
    ('Miami, FL', 'Jacksonville, FL', 1900, 'pending', '2026-02-14', NULL, NULL, NULL, 345, NULL, NULL, NULL, demo_org_id),
    ('Los Angeles, CA', 'Phoenix, AZ', 2500, 'delivered', '2026-01-28', '2026-01-29', d2, t2, 370, 375, 2500, 2125, demo_org_id);

  -- Re-seed expenses
  INSERT INTO expenses (expense_type, amount, expense_date, vendor, gallons, jurisdiction, truck_id, org_id) VALUES
    ('Fuel', 450, '2026-02-01', 'Pilot', 120, 'TX', t1, demo_org_id),
    ('Fuel', 380, '2026-02-03', 'Love''s', 100, 'GA', t2, demo_org_id);
  INSERT INTO expenses (expense_type, amount, expense_date, vendor, description, truck_id, org_id) VALUES
    ('Repairs', 850, '2026-02-05', 'TruckPro', 'Brake pad replacement', t3, demo_org_id);
  INSERT INTO expenses (expense_type, amount, expense_date, description, org_id) VALUES
    ('Insurance', 1200, '2026-02-01', 'Monthly premium', demo_org_id);

  -- Re-seed CRM contacts
  INSERT INTO crm_contacts (company_name, contact_name, contact_type, email, phone, city, state, is_active, org_id) VALUES
    ('Swift Logistics', 'John Davis', 'shipper', 'john@swiftlogistics.com', '555-0201', 'Dallas', 'TX', true, demo_org_id),
    ('Prime Carriers', 'Maria Santos', 'carrier', 'maria@primecarriers.com', '555-0202', 'Atlanta', 'GA', true, demo_org_id),
    ('Landstar BCO Network', 'Tom Mitchell', 'agent', 'tom@landstar.com', '555-0203', 'Jacksonville', 'FL', true, demo_org_id);

  -- Re-seed agency loads
  INSERT INTO agency_loads (origin, destination, broker_name, broker_rate, carrier_name, carrier_rate, margin, status, pickup_date, delivery_date, org_id) VALUES
    ('Memphis, TN', 'Nashville, TN', 'Swift Logistics', 2800, 'Prime Carriers', 2400, 400, 'delivered', '2026-02-01', '2026-02-02', demo_org_id) RETURNING id INTO al1;
  INSERT INTO agency_loads (origin, destination, broker_name, broker_rate, carrier_name, carrier_rate, margin, status, pickup_date, org_id) VALUES
    ('Jacksonville, FL', 'Savannah, GA', 'Swift Logistics', 1600, 'Prime Carriers', 1350, 250, 'in_transit', '2026-02-10', demo_org_id) RETURNING id INTO al2;
  INSERT INTO agency_loads (origin, destination, broker_name, broker_rate, carrier_name, carrier_rate, margin, status, pickup_date, org_id) VALUES
    ('Houston, TX', 'San Antonio, TX', 'Swift Logistics', 1200, 'Prime Carriers', 1000, 200, 'pending', '2026-02-15', demo_org_id) RETURNING id INTO al3;

  -- Re-seed agent commissions
  INSERT INTO agent_commissions (agent_name, load_id, commission_rate, commission_amount, status, payout_date, org_id) VALUES
    ('Tom Mitchell', al1, 10, 280, 'paid', '2026-02-05', demo_org_id),
    ('Tom Mitchell', al2, 10, 160, 'pending', NULL, demo_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_reset_demo() TO authenticated;
REVOKE ALL ON FUNCTION public.super_admin_reset_demo() FROM anon;

GRANT EXECUTE ON FUNCTION public.super_admin_get_owner_email(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.super_admin_get_owner_email(uuid) FROM anon;

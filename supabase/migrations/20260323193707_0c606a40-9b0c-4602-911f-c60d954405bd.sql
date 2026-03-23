CREATE OR REPLACE VIEW public.super_admin_infrastructure_stats
WITH (security_invoker = false) AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.is_active,
  COALESCE(sc.provider, 'built_in') AS storage_provider,
  COALESCE(sc.is_active, false) AS storage_connected,
  sc.connected_at AS storage_connected_at,
  (SELECT count(*) FROM documents d WHERE d.org_id = o.id)::integer AS document_count,
  (SELECT count(*) FROM fleet_loads fl WHERE fl.org_id = o.id)::integer AS load_count,
  (SELECT count(*) FROM trucks t WHERE t.org_id = o.id)::integer AS truck_count,
  (SELECT count(*) FROM drivers dr WHERE dr.org_id = o.id)::integer AS driver_count
FROM organizations o
LEFT JOIN org_storage_config sc ON sc.org_id = o.id
WHERE is_super_admin();

REVOKE ALL ON public.super_admin_infrastructure_stats FROM anon, public;
GRANT SELECT ON public.super_admin_infrastructure_stats TO authenticated;
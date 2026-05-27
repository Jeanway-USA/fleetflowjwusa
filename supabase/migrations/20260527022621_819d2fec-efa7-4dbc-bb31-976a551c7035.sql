
-- Backfill maintenance_requests from existing driver_requests rows
INSERT INTO public.maintenance_requests (driver_id, truck_id, org_id, issue_type, priority, description, status, created_at)
SELECT
  dr.driver_id,
  dr.truck_id,
  dr.org_id,
  COALESCE(NULLIF(regexp_replace(lower(split_part(dr.subject, ' — ', 1)), 's$', ''), ''), 'other') AS issue_type,
  dr.priority,
  COALESCE(dr.subject, '') || CASE WHEN dr.description IS NOT NULL AND dr.description <> '' THEN E'\n\n' || dr.description ELSE '' END AS description,
  'submitted'::text AS status,
  dr.created_at
FROM public.driver_requests dr
WHERE dr.request_type = 'maintenance'
  AND dr.truck_id IS NOT NULL
  AND dr.status IN ('pending', 'approved')
  AND NOT EXISTS (
    SELECT 1 FROM public.maintenance_requests mr
    WHERE mr.driver_id = dr.driver_id
      AND mr.truck_id = dr.truck_id
      AND mr.created_at = dr.created_at
  );

-- Mark migrated rows so they stop appearing in driver/dispatcher lists
UPDATE public.driver_requests
SET status = 'migrated'
WHERE request_type = 'maintenance'
  AND status IN ('pending', 'approved');

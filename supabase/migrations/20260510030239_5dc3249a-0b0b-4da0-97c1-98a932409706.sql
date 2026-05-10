-- Trigger to keep trucks.next_inspection_date in sync with completed inspection work orders
CREATE OR REPLACE FUNCTION public.sync_truck_next_inspection_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inspection_date date;
  v_new_next date;
  v_is_inspection boolean;
BEGIN
  v_is_inspection := (NEW.service_type = 'inspection') OR ('inspection' = ANY(COALESCE(NEW.service_types, ARRAY[]::text[])));

  IF NEW.status = 'completed' AND v_is_inspection AND NEW.truck_id IS NOT NULL THEN
    v_inspection_date := COALESCE(NEW.estimated_completion, NEW.entry_date, NEW.completed_at::date, CURRENT_DATE);
    v_new_next := v_inspection_date + INTERVAL '120 days';

    UPDATE public.trucks
    SET next_inspection_date = v_new_next,
        updated_at = now()
    WHERE id = NEW.truck_id
      AND (next_inspection_date IS NULL OR next_inspection_date < v_new_next);

    UPDATE public.service_schedules
    SET last_performed_date = v_inspection_date,
        updated_at = now()
    WHERE truck_id = NEW.truck_id
      AND service_name = '120-Day Inspection'
      AND (last_performed_date IS NULL OR last_performed_date < v_inspection_date);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_truck_next_inspection_date ON public.work_orders;
CREATE TRIGGER trg_sync_truck_next_inspection_date
AFTER INSERT OR UPDATE ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_truck_next_inspection_date();

-- Backfill: set next_inspection_date based on the most recent completed inspection work order
WITH latest_insp AS (
  SELECT DISTINCT ON (wo.truck_id)
    wo.truck_id,
    COALESCE(wo.estimated_completion, wo.entry_date, wo.completed_at::date) AS insp_date
  FROM public.work_orders wo
  WHERE wo.status = 'completed'
    AND wo.truck_id IS NOT NULL
    AND (wo.service_type = 'inspection' OR 'inspection' = ANY(COALESCE(wo.service_types, ARRAY[]::text[])))
  ORDER BY wo.truck_id, COALESCE(wo.estimated_completion, wo.entry_date, wo.completed_at::date) DESC
)
UPDATE public.trucks t
SET next_inspection_date = li.insp_date + INTERVAL '120 days',
    updated_at = now()
FROM latest_insp li
WHERE t.id = li.truck_id
  AND (t.next_inspection_date IS NULL OR t.next_inspection_date < (li.insp_date + INTERVAL '120 days'));
## Goal

When a work order is marked **completed**, automatically close the matching driver fault report so it disappears from the Maintenance Dashboard's "Driver Fault Reports" panel (and shows as Completed in the driver's history).

## How fault reports link to work orders

`useConvertFaultReportToWorkOrder` already writes `admin_notes = 'Converted to work order <wo.id>'` on the maintenance request when the shop converts it. We use that same link to close the request when the work order is done.

## Changes

1. **Migration — DB trigger on `work_orders`**
   - Create `public.complete_linked_maintenance_request()` (SECURITY DEFINER, `search_path = public`).
   - When `NEW.status = 'completed'` and `OLD.status IS DISTINCT FROM 'completed'`, run:
     ```sql
     UPDATE public.maintenance_requests
     SET status = 'completed', updated_at = now()
     WHERE org_id = NEW.org_id
       AND status <> 'completed'
       AND admin_notes LIKE 'Converted to work order ' || NEW.id::text || '%';
     ```
   - Attach `AFTER UPDATE OF status ON public.work_orders` trigger calling that function.

2. **Frontend invalidation** (`src/hooks/useMaintenanceData.ts`)
   - In the work-order completion mutation's `onSuccess`, also invalidate `['driver-fault-reports']` and `['driver-maintenance-requests']` so the panel + driver dashboard refresh immediately. Realtime subscription on the driver side also already covers this.

No UI/component edits are needed — the existing `useDriverFaultReports` query already filters out `completed` status, so as soon as the request flips to `completed` the card vanishes from the panel and moves to the driver's "Show history" list.
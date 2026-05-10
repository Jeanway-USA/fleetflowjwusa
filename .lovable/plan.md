# Fix Safety compliance alerts staying stuck after an inspection is completed

## Root cause

The Safety page (`src/pages/Safety.tsx`, lines ~129–140) builds the "Inspections" alert list strictly from `trucks.next_inspection_date`.

When a work order with service type "Inspection" is completed in Maintenance Management (`useCompleteWorkOrder` in `src/hooks/useMaintenanceData.ts`, lines ~960–999), the hook updates:
- `trucks.last_120_inspection_date` / `last_120_inspection_miles`
- `service_schedules.last_performed_date` for the "120-Day Inspection" row

…but it never moves `trucks.next_inspection_date` forward, and never invalidates the `['trucks']` query key that Safety uses. Result: the alert keeps showing the old due date even though the truck was just inspected.

The reverse path (`useRevertWorkOrder`, lines ~576–612) has the same blind spot — it rolls back `last_120_inspection_date` but leaves `next_inspection_date` untouched.

## Changes

All edits are in `src/hooks/useMaintenanceData.ts` — no schema changes, no Safety/Trucks UI changes, no styling changes.

### 1. `useCompleteWorkOrder` — inspection branch (~line 964)

When a completed work order's service type is an inspection:
- Compute `nextInspectionDate = inspectionDate + 120 days` (matches the existing "120-Day Inspection" cadence already enforced by `service_schedules` and `create_default_service_schedules`).
- Add `next_inspection_date: nextInspectionDate` to the existing `trucks` update alongside `last_120_inspection_date` and `last_120_inspection_miles`.

### 2. `useRevertWorkOrder` — inspection branch (~lines 580–612)

Mirror the new behavior on revert:
- If a previous inspection WO exists: set `next_inspection_date = effectiveInspDate + 120 days` on the truck.
- If none exists: set `next_inspection_date = null` (alongside the existing nulling of `last_120_inspection_date`).

### 3. Cache invalidation

In both `useCompleteWorkOrder.onSuccess` (~line 1004) and `useRevertWorkOrder.onSuccess` (~line 618), add:
```ts
queryClient.invalidateQueries({ queryKey: ['trucks'] });
```
This is the key Safety, Trucks, and the dispatcher TruckStatusGrid all share, so the alert disappears immediately after a completion.

## Out of scope (intentionally)

- No change to the Safety page logic or UI — it keeps reading `trucks.next_inspection_date`.
- No change to the Trucks page form (manual edits still work as before).
- DVIRs (`driver_inspections` pre/post-trip) are unrelated to the annual/120-day DOT inspection and continue to not affect this alert.
- No DB triggers — keeping the sync in the existing client mutation is consistent with how the rest of the maintenance flow already works.

## Verification

1. Create an "Inspection" work order for a truck whose `next_inspection_date` is overdue.
2. Complete it via the CompleteJobModal.
3. Open Safety → Inspections card: the truck should disappear from the alert list, and the count badge should drop. Trucks page should show the new `next_inspection_date` ~120 days out.
4. Revert the work order in Service History → the alert should reappear with the prior due date (or be cleared if no prior inspection existed).

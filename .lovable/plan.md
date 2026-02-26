

## Use `estimated_completion` for 120-Day Inspection Countdown

The 120-Day countdown currently starts from `entry_date` (when the work order was created). It should instead use `estimated_completion` (the actual completion/service date).

### Changes Required

**File: `src/hooks/useMaintenanceData.ts`**

Three areas need updating:

1. **Work order completion** (line 952): Change `inspectionDate` from `workOrder.entry_date` to `workOrder.estimated_completion || workOrder.entry_date` (fallback if no estimated completion set). This affects both the `service_schedules.last_performed_date` and `trucks.last_120_inspection_date`.

2. **Non-inspection schedule completion** (line 980): Same change for other service types — use `estimated_completion` with `entry_date` fallback.

3. **Rewind/delete logic** (lines 512-602): The `fetchMostRecentMatchingWO` query and revert logic also need to select `estimated_completion`, use it as the date source, and sort by it. Specifically:
   - Line 515: Add `estimated_completion` to the select
   - Lines 555, 590, 599: Use `prev.estimated_completion || prev.entry_date` instead of `prev.entry_date`
   - Line 518: Order by `estimated_completion` instead of `entry_date`

4. **Service History date display** (line 402): Change `date: wo.entry_date` to `date: wo.estimated_completion || wo.entry_date` and update the sort order query (line 366) to use `estimated_completion`.


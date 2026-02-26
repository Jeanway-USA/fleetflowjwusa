

## Fix: 120-Day Inspection Countdown and Completion Date Consistency

### Problem

The database currently shows `last_performed_date: 2026-02-26` for the 120-Day Inspection on truck 433780, but the actual inspection work order has `estimated_completion: 2025-12-11`. This means the countdown shows "120d left" from today instead of counting from December 11, 2025. The previous code fix for completion logic is in place, but the record was completed before the fix was applied. Additionally, several other code paths still use `entry_date` instead of `estimated_completion` for baseline calculations and display.

### Root Cause

1. The work order was completed before the `estimated_completion` fix was deployed, so the database has stale data
2. The PM Schedule baseline query still fetches and uses `entry_date` exclusively (lines 671, 698, 740)
3. The edit flow in ServiceHistoryTab only updates `entry_date`, not `estimated_completion` (violating "keep both synced")
4. The `InspectionCountdown` component in `HealthBar.tsx` doesn't append `T00:00:00` to date strings (timezone shift risk)
5. The `TruckHistoryDrawer` displays `entry_date` instead of `estimated_completion`

### Changes Required

**File: `src/hooks/useMaintenanceData.ts`**

1. **PM Schedule baseline query** (lines 669-673): Add `estimated_completion` to the select and order by it
2. **woByTruck index** (lines 698-709): Include `estimated_completion` in the indexed data
3. **findBaselineWorkOrder** (line 740): Return `estimated_completion || entry_date` as the baseline date
4. **useUpdateCompletedWorkOrder** (lines 444-454): Also set `estimated_completion` when `entry_date` is provided (keeping both synced per user preference)

**File: `src/components/maintenance/ServiceHistoryTab.tsx`**

5. **Edit form save** (lines 177-185): Send `estimated_completion` alongside `entry_date` so both stay in sync

**File: `src/hooks/useMaintenanceData.ts` (useUpdateCompletedWorkOrder)**

6. **Mutation type and update** (lines 435-453): Accept optional `estimated_completion` parameter and include it in the update payload

**File: `src/components/maintenance/HealthBar.tsx`**

7. **InspectionCountdown** (line 145): Append `T00:00:00` to `lastInspectionDate` to prevent timezone-induced one-day offset (already done in `CompactHealthDot` and `usePMHealthCalculations` but missing here)

**File: `src/components/maintenance/TruckHistoryDrawer.tsx`**

8. **Work order date display** (line 192): Use `wo.estimated_completion || wo.entry_date` instead of `wo.entry_date`

**Database: Backfill existing records**

9. Run a data correction to update `service_schedules.last_performed_date` and `trucks.last_120_inspection_date` from the actual `estimated_completion` dates of their most recent completed inspection work orders. This is a one-time data operation using the insert/update tool.

### Summary Table

| Area | File | What Changes |
|------|------|-------------|
| PM baseline query | useMaintenanceData.ts:671 | Select + order by `estimated_completion` |
| Baseline date | useMaintenanceData.ts:740 | Use `estimated_completion \|\| entry_date` |
| Edit mutation | useMaintenanceData.ts:435-453 | Accept and write `estimated_completion` |
| Edit form | ServiceHistoryTab.tsx:177-185 | Send `estimated_completion` with `entry_date` |
| Inspection display | HealthBar.tsx:145 | Add `T00:00:00` suffix for timezone safety |
| Truck history | TruckHistoryDrawer.tsx:192 | Use completion date for display |
| Data backfill | Database update | Correct `last_performed_date` from existing work orders |


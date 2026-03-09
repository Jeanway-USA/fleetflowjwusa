

## True Cost of Maintenance Feature

### Overview
Add "Days Down" tracking when completing work orders, and display a "True Cost of Maintenance" card in the Truck P&L tab that combines parts/labor cost with estimated lost revenue.

### Database Migration
Add a `days_down` integer column to `work_orders`:
```sql
ALTER TABLE public.work_orders ADD COLUMN days_down integer;
```

### Changes

**1. `src/hooks/useMaintenanceData.ts`**
- Add `days_down` to the `WorkOrder` interface
- In `useCompleteWorkOrder`, calculate `days_down` as `differenceInDays(now, created_at)` and include it in the update payload
- In `useTruckProfitability`, also fetch `days_down` from completed work orders and return `totalDaysDown` and `totalMaintenanceCost` separately
- Add a query for the `avg_daily_truck_revenue` company setting (default $1,000)

**2. `src/components/maintenance/CompleteJobModal.tsx`**
- Calculate and display "Days Down" (difference between `workOrder.created_at` and now) as a read-only info line in the form, so the user sees how long the truck was out

**3. `src/components/maintenance/TruckHistoryDrawer.tsx` — P&L Tab**
- Add a new "True Cost of Maintenance" card after the existing metric cards
- Show: Parts & Labor cost, Days Down × Daily Revenue = Estimated Lost Revenue, and a bold combined "True Cost" total
- The daily revenue rate comes from `company_settings` (`avg_daily_truck_revenue`, default `1000`)

### Files
| File | Action |
|------|--------|
| DB migration | Add `days_down` column to `work_orders` |
| `src/hooks/useMaintenanceData.ts` | Update WorkOrder type, complete mutation, profitability hook |
| `src/components/maintenance/CompleteJobModal.tsx` | Show Days Down info |
| `src/components/maintenance/TruckHistoryDrawer.tsx` | Add True Cost card to P&L tab |


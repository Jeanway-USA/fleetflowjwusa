# Archived loads still showing to drivers

## What's happening

Confirmed in the database: the duplicate loads you deleted (for example 7727005 and 1182511) are marked as archived, but a second, still-active copy of each is assigned to the same driver — and the driver screens don't filter out archived loads at all. So drivers keep seeing removed loads, and duplicates appear twice in their list.

## Fix

1. Make every driver-facing load query ignore archived loads:
   - Driver home / active load feed
   - My Loads list
   - Driver stats, pay widget, weekly performance, leaderboard
   - Load status update, arrival, odometer and proof-of-delivery lookups
2. Add the same protection at the data-access-rule level so archived loads can never reach a driver, even from a screen that forgets to filter.
3. Verify with the affected driver's records that each load number appears once and archived ones are gone.

Note: the duplicates themselves are separate real records — deleting one leaves the other active, which is expected. If you also want the leftover copies removed, tell me which load numbers and I'll clean them up.

## Technical details

- `fleet_loads` driver/operations RLS policies have no `deleted_at IS NULL` predicate; add it to the driver SELECT/UPDATE policies via migration.
- Add `.is('deleted_at', null)` to `fleet_loads` queries in: `src/hooks/useDriverHomeData.ts`, `src/components/driver/DriverLoadsView.tsx`, `src/pages/DriverStats.tsx`, `src/components/driver/DriverPayWidget.tsx`, `src/components/driver/WeeklyPerformanceWidget.tsx`, `src/components/shared/DriverLeaderboard.tsx`, plus `useAutoArrival.ts`, `useActiveLoadRoute.ts`, `useOfflineQueue.ts`, `ActiveLoadCard.tsx`, `GeofenceArrivalDrawer.tsx`, `StartingOdometerDialog.tsx`, `EndingOdometerDialog.tsx`, `ProofOfDeliveryDialog.tsx`.

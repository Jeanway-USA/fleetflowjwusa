# Mobile-Friendly Data Fetching Audit — Driver + Dispatcher

## Current state (verified)

Global `QueryClient` in `src/App.tsx` already enforces the two big mobile wins:

- `refetchOnWindowFocus: false` — switching tabs does **not** refetch
- `staleTime: 5 * 60 * 1000` — 5-minute default freshness window
- `gcTime: 24h`, `networkMode: 'offlineFirst'`

So the "every tab switch hits Supabase" symptom is already prevented project-wide. The remaining wins are per-query: extend staleness for slow-changing reference data, stop background polling when the tab is hidden, and remove redundant polling where realtime already invalidates.

## Findings by category

**A. Reference data with no per-query overrides** (re-fetched too often given how rarely they change) — extend staleTime to 15 min:
- `DriverPayWidget` / `WeeklyPerformanceWidget`: `driver-name`, `driver-settings`
- `LocationSharing`: `user-org`
- `DriverLoadsView`: `driver_record`
- `DispatcherAlerts`, `DriverAssignmentPanel` (driver/truck lookups inside list builders)
- `DriverStatusGrid`, `TruckStatusGrid` (status lists — 2 min is fine, but add explicit value)

**B. Lists that change moderately** — keep ~2 min explicit staleTime so realtime invalidation drives updates, not polling:
- `ActiveLoadsBoard`, `UpcomingPickups`, `DispatcherAlerts`, `DriverRequestsCard`, `DriverNotifications`, `FleetTimelineScheduler` queries

**C. Background polling that wastes mobile data** — gate with `refetchIntervalInBackground: false` and lengthen intervals:
- `FleetMapView` in-transit loads: `refetchInterval: 30_000` → 60s + no background polling (realtime channel already exists for `driver_locations`)
- `DriverMessages` unread count: `refetchInterval: 30_000` → 60s + no background polling
- `DriverDashboard` `driver-location` query: `refetchInterval: 30_000` → 60s + no background polling

**D. Period-keyed queries** (weekly loads keyed by week-start ISO) — add `placeholderData: keepPreviousData` so week navigation doesn't blank out while refetching.

**E. Modal-scoped queries** (`RapidCallModal`) — already correctly gated with `enabled: !!open && ...`. Add `staleTime: 60_000` so reopening within a minute uses cache.

## Changes

Add explicit per-query options to the following files. No business logic, no UI changes, no new dependencies — only React Query option objects.

**Driver components**
- `src/components/driver/DriverPayWidget.tsx` — staleTime 15m on `driver-name`, `driver-settings`; staleTime 2m + `placeholderData: keepPreviousData` on `driver-weekly-loads`
- `src/components/driver/WeeklyPerformanceWidget.tsx` — same as above for its three queries
- `src/components/driver/LocationSharing.tsx` — staleTime 15m on `user-org`; staleTime 30s on `driver-location` (frequently mutated locally)
- `src/components/driver/DriverNotifications.tsx` — staleTime 60s (realtime channel already invalidates)
- `src/components/driver/DriverMessages.tsx` — `refetchInterval: 60_000`, `refetchIntervalInBackground: false`, staleTime 30s on unread; staleTime 60s on threads/messages
- `src/components/driver/DriverRequestsCard.tsx` — staleTime 2m
- `src/components/driver/DriverLoadsView.tsx` — staleTime 15m on `driver_record`; staleTime 2m on `driver_loads`
- `src/pages/DriverDashboard.tsx` — `driver-location` query: `refetchInterval: 60_000`, `refetchIntervalInBackground: false`

**Dispatcher components**
- `src/components/dispatcher/ActiveLoadsBoard.tsx` — staleTime 2m
- `src/components/dispatcher/UpcomingPickups.tsx` — staleTime 2m
- `src/components/dispatcher/DispatcherAlerts.tsx` — staleTime 2m
- `src/components/dispatcher/DriverStatusGrid.tsx` — staleTime 2m
- `src/components/dispatcher/TruckStatusGrid.tsx` — staleTime 5m (default, make explicit)
- `src/components/dispatcher/DriverAssignmentPanel.tsx` — staleTime 2m on both queries
- `src/components/dispatcher/FleetTimelineScheduler.tsx` — staleTime 15m on `timeline-drivers` and `timeline-service-schedules`; staleTime 2m + `placeholderData: keepPreviousData` on weekly assigned loads
- `src/components/dispatcher/FleetMapView.tsx` — `refetchInterval: 60_000`, `refetchIntervalInBackground: false` on `in-transit-loads-map`; staleTime 30s on `driver-locations`
- `src/components/dispatcher/RapidCallModal.tsx` — staleTime 60s on both queries
- `src/pages/DispatcherDashboard.tsx` — `dispatcher-stats`: staleTime 2m (currently uses default; realtime channel already invalidates on `fleet_loads` changes)

## Out of scope

- No changes to mutations, realtime subscriptions, or query keys (would invalidate existing caches and break cross-component invalidations).
- No changes to global `QueryClient` defaults — they're already correct.
- No refactor of components that don't use React Query (e.g. `MonthlyBonusWidget`, `ActiveLoadCard`) — they receive data via props.

## Verification

- `bunx tsc --noEmit -p tsconfig.app.json` — must remain clean
- Spot-check Network tab in preview: tab away & back → no new Supabase requests; navigate between weeks → smooth UI (no flash) thanks to `placeholderData`

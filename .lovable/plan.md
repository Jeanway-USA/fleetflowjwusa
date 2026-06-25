# Automated Geofence Check-Calls

Today the driver app already computes distance-to-destination and pops a `GeofenceArrivalDrawer` asking the driver to tap "Confirm Arrival" before the status moves to `unloading`. We will keep the math, drop the manual tap, and extend the logic to cover the origin facility as well, so dispatchers see status flips on their board automatically.

## 1. Extend the geofence hook — `src/hooks/useGeofenceStatus.ts`

- Accept BOTH `originAddress` and `destinationAddress` (plus the current `status`).
- Geocode whichever endpoint is currently relevant:
  - `assigned` / `loading` → watch origin (e.g. Rheem Manufacturing Warehouse).
  - `in_transit` → watch destination (e.g. Hughes Supply).
- Return `{ atOrigin, atDestination, distanceMiles }` instead of the dismiss-driven shape.
- Radius stays 2 mi (configurable constant).
- Add a small ref-based debounce so a single GPS jitter inside the radius doesn't refire.

## 2. New silent auto-arrival hook — `src/hooks/useAutoArrival.ts`

A new hook that owns the side effect. Driven by the values from `useGeofenceStatus`:

- When `atOrigin` becomes true AND status is `assigned`/`loading`, transition load → `loading` (if not already) — origin arrival.
- When `atDestination` becomes true AND status is `in_transit`, transition load → `unloading` ("Arrived").
- Each transition:
  1. Optimistic patch via the existing `useOptimisticLoadStatus` so the UI flips immediately and survives flaky signal.
  2. `supabase.from('fleet_loads').update({ status: <next> })` for the load.
  3. Insert a row into `load_status_logs` with `source = 'geofence_auto'`, `previous_status`, `new_status`, lat/lng, and the matched facility label. This is the "silent log timestamp event."
  4. No toast, no drawer — silent per the spec. A subtle inline badge ("Auto-arrived") shows on the driver card so the driver knows what happened.
- Per-load idempotency: keep a ref of `${loadId}:${transition}` already fired this session, and gate on the DB row's current status so we never re-trigger on refetch.

## 3. Wire-up — `src/pages/DriverDashboard.tsx`

- Replace the current `useGeofenceStatus(driverCoords, destination, loadId)` call + `GeofenceArrivalDrawer` render with the new hook signature and `useAutoArrival(activeLoad, driverCoords)`.
- Remove `showGeofenceDrawer` and the `<GeofenceArrivalDrawer />` JSX. Drawer file stays for now (unused) so we don't churn unrelated tests — it can be deleted in a follow-up.
- `LocationSharing` already pushes GPS every 10 min and on every `watchPosition` tick we use locally, so no changes needed there. The auto-arrival hook reads `currentPosition` straight from `LocationSharing`'s parent state via a small lift: `DriverDashboard` will own the latest `driverCoords` (already partially the case) and pass it to both `LocationSharing` and `useAutoArrival`.

## 4. Dispatcher view

No code changes required. `ActiveLoadsBoard` already renders `status` live from `fleet_loads`; the silent DB update propagates through the existing query/subscription, so "In Transit" flips to "Arrived/Unloading" without dispatcher input.

## 5. Edge cases & guardrails

- **No origin/destination coords**: hook no-ops, status stays as-is.
- **Driver disabled GPS sharing**: no `driverCoords` → no firing. Manual status buttons on `ActiveLoadCard` keep working as a fallback.
- **Offline**: optimistic patch + the existing offline queue cover it; the real update reconciles on reconnect.
- **Same facility for origin and destination**: status gate (`in_transit` only for destination match) prevents double-fires.
- **Driver loops in/out of radius**: idempotency ref + DB status check ensures we only transition forward, never backward.

## Files

**New**
- `src/hooks/useAutoArrival.ts`

**Edited**
- `src/hooks/useGeofenceStatus.ts` (origin + destination, return shape)
- `src/pages/DriverDashboard.tsx` (swap drawer for silent hook)

**Unchanged / out of scope**
- `GeofenceArrivalDrawer.tsx` left in place but no longer rendered.
- No schema changes; reusing existing `fleet_loads.status` + `load_status_logs`.
- No dispatcher UI changes.
- No changes to `LocationSharing` upload cadence.

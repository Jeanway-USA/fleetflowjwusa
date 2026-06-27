# Spectator View ↔ Driver Dashboard: 1:1 Parity Fix

## Problem
`DriverSpectatorView` was supposed to render the *exact same* layout, widgets, and data the driver sees — just read-only. It currently drifts from `DriverDashboard` in several places, so dispatch/owners see a different picture than the driver in the cab.

## Gaps found (spectator vs. driver)

| Area | Driver Dashboard | Spectator (current) |
|---|---|---|
| My Equipment card | ✅ shown | ❌ missing |
| Document Scan button | ✅ shown | ❌ missing |
| Location Sharing widget | ✅ shown (left col) | ❌ missing |
| Driver Notifications bell | ✅ shown | ❌ missing (fine to hide, but layout differs) |
| Onboarding Revision banner | ✅ shown | ❌ missing |
| Pay/Performance + GPS row | 2-column grid on md+ | Stacked single column |
| Next-load filter | status ∈ assigned/pending AND pickup_date ≥ today | No filter — can show stale loads |
| `DriverRequestsCard` props | passes `activeLoadNumber` | omits `activeLoadNumber` |
| Extra widgets in spectator | — | `CredentialsCompliance` injected (not on driver home) |
| GPS card | uses `LocationSharing` widget | custom "GPS Active" card |

## Changes

### `src/pages/DriverSpectatorView.tsx`
Rebuild the body so the JSX, ordering, and props match `DriverDashboard` 1:1, wrapped in the existing `ReadOnly` overlay for interactive widgets:

1. **Header row**: keep the Spectator banner card at the top (driver identity + "Back to Drivers"), then render the same compact `OnboardingRevisionBanner` driver sees.
2. **My Equipment**: add `<MyEquipmentCard driverId truckId/assignedTruck>` immediately above the Active Load card.
3. **Active Load**: keep current logic but apply the same `nextLoad` filter the driver uses (`status assigned|pending` AND `pickup_date >= today`).
4. **Document Scan**: add `<DocumentScanButton driverId>` wrapped in `<ReadOnly>`.
5. **GPS + Pay row**: replace the standalone "GPS Active" card with the same 2-col grid (`grid-cols-1 md:grid-cols-2`) containing `<LocationSharing>` (read-only) and the pay/performance widget — matching the driver layout exactly.
6. **Monthly Bonus, Leaderboard**: already match; leave as-is.
7. **DriverRequestsCard**: pass `activeLoadNumber={activeLoad?.landstar_load_id}` so the spectator sees the same load reference text.
8. **Remove** the extra `CredentialsCompliance` block from the home view (it isn't on the driver's home; keeps parity). Credentials remain accessible from the driver detail sheet.
9. Keep the small "Read-only" notice strip and the `ReadOnly` overlay on every interactive widget (`ActiveLoadCard`, `DocumentScanButton`, `LocationSharing`, `DriverRequestsCard`, `MaintenanceRequestCard`).

### Shared data hook (parity guarantee)
To prevent future drift when new fields are added to the load object, extract the driver-home data fetching into a reusable hook:

- **New file** `src/hooks/useDriverHomeData.ts` exporting `useDriverHomeData(driverId)` that returns `{ driver, activeLoads, assignedTruck, driverLocation, activeLoad, nextLoad, isLoading, refetchLoads }` using the exact queries currently in `DriverDashboard` (same `select('*, trucks(*), load_accessorials(*)')`, same status filter, same activeLoad/nextLoad derivation).
- Refactor both `DriverDashboard.tsx` and `DriverSpectatorView.tsx` to consume this hook. Driver passes `user.id → driver.id`; spectator passes `driverId` from URL params.
- Result: any future column added to `fleet_loads` (PU#, trailer, etc.) automatically flows to both views because they share one query.

## Out of scope
- No DB/RLS changes.
- No edits to `ActiveLoadCard`, `NextLoadPreview`, `MyEquipmentCard`, `LocationSharing`, etc. — they already render whatever fields exist on the load object.
- Audit Trail / executive portal untouched.

## Verification
After the edits, open `/driver-view/:driverId` as an owner and `/driver` as the assigned driver side-by-side: every card, every order, every value should match (spectator just has the banner on top and grey overlays blocking clicks).

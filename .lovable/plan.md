

## Plan: Redesign ActiveLoadCard + Fix Estimated Location Logic

### Overview

Two changes:
1. Redesign the ActiveLoadCard on the Driver Dashboard to match the compact card style from the Driver Fleet Loads page
2. Fix the map so that when a driver stops sharing their GPS, the "Estimated" position uses their last known location instead of a random point on the route

---

### Part 1: Redesign ActiveLoadCard

The current ActiveLoadCard is large and verbose with a big target location box, full addresses, an embedded route map preview, and separate sections for miles, pay, and special instructions. The DriverLoadCard in the Fleet Loads page is much more compact and scannable.

**File:** `src/components/driver/ActiveLoadCard.tsx`

The card will be restructured to match the DriverLoadCard design:

- **Status color bar** at the top (keep as-is)
- **Load ID and status badge** on one line (e.g., "Load #BH123456" with a status badge)
- **Route as a single compact line**: Origin city, ST -> Destination city, ST (with MapPin icon and arrow)
- **Date/time row**: Shows pickup or delivery date depending on status, with relative timestamps for delivered loads
- **Miles and estimated pay** on one line with a border-top separator
- **Action buttons row**: "Load Details" and the status progression button side-by-side (equally sized)
- **Remove** the large target location box, the embedded route map preview, the separate special instructions section, and the separate miles/pay blocks

The Load Details dialog will remain mostly the same (it is only shown on tap), preserving full addresses, special instructions, and all detail fields.

The empty state (no active load) stays the same.

Key helper functions being aligned to match the DriverLoadsView patterns:
- `getCondensedAddress` will return a simple string (City, ST) instead of an object with full/short
- Status colors will use the same color scheme (amber for pending, blue for assigned, purple for loading, emerald for in_transit)
- Date formatting will use the same conditional logic (pickup vs delivery based on status)

---

### Part 2: Fix Estimated Location After GPS Stops

**Problem:** When a driver stops GPS sharing, the `LocationSharing` component deletes their `driver_locations` row entirely. Then in `FleetMapView`, the fallback uses `getProgressFromStatus('in_transit')` which returns `0.5 + Math.random() * 0.3` -- a different random position on every re-render.

**Solution:** Stop deleting the `driver_locations` row when a driver turns off GPS. Instead, add an `is_sharing` boolean column to the table. The FleetMapView already differentiates "live" vs "estimated" using a 10-minute freshness check -- we will enhance this to also use the `is_sharing` flag. When a driver stops sharing, their last coordinates stay in the database and are used as the estimated position.

**Database migration:**
- Add `is_sharing` boolean column to `driver_locations`, default `true`

**File:** `src/components/driver/LocationSharing.tsx`

- **Stop sharing**: Instead of calling `deleteLocation` (which removes the row), call a new `deactivateLocation` mutation that sets `is_sharing = false` on the existing row
- **Start sharing**: When upserting location, also set `is_sharing = true`
- Remove the `deleteLocation` mutation entirely

**File:** `src/components/dispatcher/FleetMapView.tsx`

- **Fetch all driver locations** (remove the 10-minute filter from the initial useEffect that populates `driverLocations`). Instead, include all records.
- **Determine live vs estimated**: A location is "live" when `is_sharing = true` AND `updated_at` is within 10 minutes. Otherwise it is "last known" (estimated).
- **Priority order for truck position**:
  1. Live GPS (green pulsing icon) -- `is_sharing = true` and fresh
  2. Last known GPS from `driver_locations` (blue icon) -- row exists but `is_sharing = false` or stale
  3. Interpolated position (blue icon) -- only if no `driver_locations` record exists at all

**File:** `src/lib/geocoding.ts`

- Remove `Math.random()` from `getProgressFromStatus` for the `in_transit` case. Use a fixed value (e.g., `0.5`) instead. This ensures that for the rare case where no location record exists at all, the estimated position is at least stable rather than jumping around on every render.

---

### Technical Summary

| Action | File | Details |
|--------|------|---------|
| Migration | New SQL migration | Add `is_sharing` boolean column to `driver_locations` |
| Modify | `src/components/driver/ActiveLoadCard.tsx` | Redesign card to compact format matching DriverLoadCard style |
| Modify | `src/components/driver/LocationSharing.tsx` | Replace delete with `is_sharing = false` update on stop |
| Modify | `src/components/dispatcher/FleetMapView.tsx` | Use last known GPS coords as estimated position, update live detection logic |
| Modify | `src/lib/geocoding.ts` | Remove `Math.random()` from `getProgressFromStatus` |


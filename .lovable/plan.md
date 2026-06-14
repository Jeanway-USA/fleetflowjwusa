## Goal

Show drivers their next pre-planned load below the Active Load HUD as a read-only "Up Next (Pre-Plan)" card with pickup, destination, date, and estimated pay. No Start Load action until the current load is delivered.

## Changes

### 1. `src/pages/DriverDashboard.tsx` — pick the next future pickup
Replace the current `nextLoad` line with logic that:
- Excludes the active load.
- Filters to status `assigned` or `pending`.
- Keeps only loads whose `pickup_date >= today` (YYYY-MM-DD compared as string; respects existing `T00:00:00` date rule by not parsing in TZ-shifting ways).
- Picks the earliest `pickup_date` (already sorted ascending by the query).

The existing query at lines 61-74 already pulls `pending`/`assigned`, so no query change is needed — only the in-memory selection. Pass `payRate` + `payType` props to `NextLoadPreview`.

### 2. `src/components/driver/NextLoadPreview.tsx` — rebrand + estimated pay
- Change label from "Next Assignment" → **"Up Next (Pre-Plan)"**.
- Add a small subtitle: "Starts after your current load is delivered".
- Accept new optional props: `payRate`, `payType`, plus `rate` and `booked_miles` on the load (already in the type).
- Compute estimated pay using the same rules as `ActiveLoadCard`/`DriverPayWidget`:
  - `percentage` → `load.rate * (payRate / 100)`
  - `per_mile`   → `(load.booked_miles ?? 0) * payRate`
  - `flat`       → not shown (weekly salary)
- Render as a faded/dashed card (already `bg-muted/30 border-dashed`) — keep that styling, add `opacity-90` and a lock badge to signal read-only.
- No buttons, no click handlers — purely informational. (Already the case.)

### 3. Read-only enforcement
`NextLoadPreview` contains no Start Load button today, so no change needed beyond keeping it that way. The "Start Load" action lives on `ActiveLoadCard` only and is bound to the active load — the pre-plan card never receives that handler.

## Out of scope
- No DB schema or RLS change.
- No new query — the existing `driver-active-loads` query already returns the needed rows.
- ActiveLoadCard logic unchanged.

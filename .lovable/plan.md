# Multi-Asset Dispatch Availability & Hometime Timeline

Turn the existing `FleetTimelineScheduler` into a true 14-day multi-asset Gantt with distinct status strips, an outbound planning overlay, and hard hometime locks — and mirror the hometime signal into `DriverStatusGrid`.

## Data source (no new tables)

Approved hometime already lives in `driver_requests` with `request_type='home_time'`, `status='approved'`, `start_date`, `end_date`. That's the source of truth; no schema changes.

## 1. `FleetTimelineScheduler.tsx`

**Grid**
- Extend the rolling window from 7 → **14 days**. `gridTemplateColumns: '140px repeat(14, minmax(56px, 1fr))'`, horizontal scroll preserved.
- Prev/Next buttons step by 7 days (half-window nudge) instead of full 7 days × 1 offset multiplier; "Today" still snaps `weekOffset` to 0.
- Widen `min-w-[600px]` → `min-w-[1080px]` so 14 columns don't crush.

**Color-blocked status strips per row-day cell**

Each cell's background is picked from a shared `getCellStatus(driverId, day)` helper. Priority order (highest wins):

1. `hometime` → muted-purple + a diagonal striped SVG pattern (`background-image: repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/.15) 0 6px, transparent 6px 12px)`). Cell is `pointer-events-none` for drops.
2. `active-transit` → primary/15 tint; the existing load bar renders on top.
3. `outbound-planning` → amber/10 tint on the 1–3 days immediately after `delivery_date` of the last active load in the window, with a small `MapPin` chip labeled "Reload @ {destination_state}". Skipped if the driver has another load or hometime already scheduled in that gap.
4. `idle` → default muted background (current look).

Add a compact **legend row** above the grid (four swatches: Active Transit, Pre-Approved Hometime, Outbound Planning, Unassigned/Idle).

**New query**
```ts
useQuery(['timeline-hometime', windowStart, windowEnd], () =>
  supabase.from('driver_requests')
    .select('driver_id, start_date, end_date, request_type, status')
    .eq('request_type', 'home_time')
    .eq('status', 'approved')
    .gte('end_date', windowStart)
    .lte('start_date', windowEnd)
)
```

**Hometime buffer locks**
- Extend `checkConflicts` with a hometime branch: if the load's pickup/delivery interval overlaps any approved hometime for the driver → `hasConflict: true, message: "Driver has approved hometime {start}–{end}. Move or reschedule the hometime first."`
- Drop handler already respects the toast + early-return; the striped cells also block `onDrop` via `pointer-events-none` for immediate visual feedback.

**Outbound Planning Window overlay**
- After rendering active-load bars, compute for each driver the last-delivering load whose `delivery_date` falls inside the window. If the 3 days after delivery are free of loads/hometime, render an absolutely-positioned dashed amber strip across those cells with a `MapPin` chip: `"Reload near {stateFromDestination}"` (parse the last comma-separated token from `destination`). Clicking the chip is a no-op for v1 (dispatcher visual cue only).

## 2. `DriverStatusGrid.tsx`

- Add the same `driver_requests` fetch (scoped to today → +14d, approved home_time only) alongside the existing loads query.
- Replace the binary Available / On Load pill with a 3-way status:
  - `On Hometime` (purple pill, `Home` icon) — when today is within any approved hometime window.
  - `On Load` (existing blue).
  - `Available` (existing green) — but if hometime is *upcoming* within 7 days, append a small amber sub-line: `"Hometime {MMM d}–{MMM d}"`.
- Precedence: Hometime > On Load > Available (matches the timeline lock: if hometime is active, dispatch should treat the driver as locked even if a stale load is still marked assigned).

## Files touched

- `src/components/dispatcher/FleetTimelineScheduler.tsx`
- `src/components/dispatcher/DriverStatusGrid.tsx`

## Out of scope

- No new tables, no changes to `driver_requests` write paths, no changes to `useDriverRequests` hook.
- No new global CSS — diagonal pattern is inline via a Tailwind arbitrary `bg-[image:...]` class.
- The "Outbound Planning" chip is a visual prompt only; auto-booking suggestions come later.

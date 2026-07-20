# Dispatcher Dashboard — Tabbed Reorganization

Restructure `src/pages/DispatcherDashboard.tsx` only. No child components will be deleted, renamed, or have their internal logic changed — they will simply be repositioned into the new layout.

## Structure

```text
┌─ Greeting header + "New Load" button ────────────────────┐
├─ KPI Grid (PINNED — always visible above tabs) ──────────┤
│  Active Loads │ Available Drivers │ Active Trucks │ TZ   │
├─ Tab Bar: [Command Center] [Dispatch Board] [Fleet Roster]
├─ Tab Content ────────────────────────────────────────────┤
│                                                          │
│  Command Center (default):                               │
│  ┌──────────────────────┬───────────────────────┐        │
│  │                      │  DispatcherAlerts     │        │
│  │   FleetMapView       │                       │        │
│  │   (2/3 width)        ├───────────────────────┤        │
│  │                      │  UpcomingPickups      │        │
│  │                      │  (1/3 width column)   │        │
│  └──────────────────────┴───────────────────────┘        │
│                                                          │
│  Dispatch Board:                                         │
│    DriverAssignmentPanel                                 │
│    FleetTimelineScheduler                                │
│    ActiveLoadsBoard                                      │
│                                                          │
│  Fleet Roster:                                           │
│    DriverStatusGrid │ TruckStatusGrid  (2-col)           │
│    DriverLeaderboard                                     │
└──────────────────────────────────────────────────────────┘
```

## Changes

### 1. Pinned KPI Header
- The 4 KPI cards (Active Loads, Available Drivers, Active Trucks, Upcoming Pickups) render outside the tabs so they persist across tab switches.
- Rename the 4th card from "Upcoming Pickups" to "Timezone" per the request. It will display the browser's local IANA timezone (e.g. `America/Chicago`) via `Intl.DateTimeFormat().resolvedOptions().timeZone`, with a `Clock` icon. The existing `upcomingPickups` stat is still surfaced inside the Command Center via the `UpcomingPickups` component, so no data is lost.

### 2. Tab Navigation
- Use the existing shadcn `Tabs` component (`@/components/ui/tabs`) already in the project.
- Style `TabsList` to look like a horizontal underline nav: transparent background, and active tab styled with a colored bottom border (`data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground`) rather than the default filled pill.
- Default tab: `command-center`.

### 3. Command Center tab
- Two-column grid: `grid-cols-1 lg:grid-cols-3 gap-6`.
- Left (spans 2 cols on lg): `FleetMapView` wrapped in existing `ErrorBoundary` + `Suspense` + `MapSkeleton` (unchanged).
- Right (1 col): vertical stack — `DispatcherAlerts` on top, `UpcomingPickups` below it.
- `data-tour="fleet-map"` and the `#assign-driver` scroll-mt anchor are preserved (anchor moves to Dispatch Board where `DriverAssignmentPanel` now lives).

### 4. Dispatch Board tab
- Stacked full-width sections in order: `DriverAssignmentPanel` (keeps `id="assign-driver"`), `FleetTimelineScheduler`, `ActiveLoadsBoard` (keeps `data-tour="active-loads"`).

### 5. Fleet Roster tab
- Top row: 2-column grid with `DriverStatusGrid` and `TruckStatusGrid` (keeps `data-tour="driver-status"` wrapper).
- Below: `DriverLeaderboard`.

### 6. Quick Actions Footer
- Kept as-is, rendered below the tab content so it's always visible.

## Files Touched

- `src/pages/DispatcherDashboard.tsx` — sole file modified. All imports, queries, realtime subscription, hash-scroll effect, and child component usages are retained.

## Out of Scope

- No changes to any child component (`FleetMapView`, `DispatcherAlerts`, `UpcomingPickups`, `DriverAssignmentPanel`, `FleetTimelineScheduler`, `ActiveLoadsBoard`, `DriverStatusGrid`, `TruckStatusGrid`, `DriverLeaderboard`).
- No data model, query, or backend changes.
- No routing changes; tabs are local component state (not URL-synced) unless you'd like that added.

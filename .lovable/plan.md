

## FleetTimelineScheduler — Gantt-Style Dispatcher Timeline

### Approach
Build a custom CSS-grid-based Gantt chart (no new dependencies). Recharts is bar/line oriented and poorly suited for timeline blocks. A CSS grid gives full control over block positioning, drag-drop zones, and styling.

### Data Sources
- **Active drivers**: `drivers_public_view` (status = 'active')
- **Assigned loads** (7-day window): `fleet_loads` with `pickup_date`/`delivery_date`, joined to `drivers` — these become colored blocks on each driver's row
- **Unassigned loads**: `fleet_loads` where `driver_id IS NULL` and `status IN ('pending','booked')` — rendered in a sidebar/tray for drag-and-drop
- **PM schedules** (overlap check): `service_schedules` joined to `trucks` joined to drivers via `trucks.current_driver_id` — used to detect conflicts when dropping a load

### Component Structure

**File: `src/components/dispatcher/FleetTimelineScheduler.tsx`**

```text
┌──────────────────────────────────────────────────────┐
│ [Header: "Fleet Timeline" + date range + nav arrows] │
├────────┬─────────────────────────────────────────────┤
│ Driver │  Mon  │  Tue  │  Wed  │  Thu  │  Fri  │ ... │
├────────┼───────┴───────┴───────┴───────┴───────┴─────┤
│ Smith  │ ██ Load #123 ██         ██ Load #456 ██     │
│ Jones  │          ██ Load #789 ██                     │
│ ...    │                                              │
├────────┼─────────────────────────────────────────────┤
│ Unassigned Loads (drag from here)                    │
│ [Load A] [Load B] [Load C]                           │
└──────────────────────────────────────────────────────┘
```

- CSS grid with 7 day-columns (each subdivided if needed) + 1 label column
- Each driver = 1 row; loads rendered as absolutely-positioned colored bars spanning pickup→delivery dates
- Unassigned loads tray at bottom, each card is `draggable`

### Drag-and-Drop + Validation
- HTML5 drag-and-drop (same pattern as existing `DriverAssignmentPanel`)
- `onDrop` on a driver row:
  1. Calculate target date from drop position (column index)
  2. Check overlap: compare dropped load's `pickup_date`→`delivery_date` against all existing loads for that driver in the 7-day window
  3. Check PM conflict: query `service_schedules` for the driver's assigned truck, check if any scheduled service falls within the load's date range
  4. If overlap/conflict → `toast.warning("Load overlaps with existing assignment")` or `"...conflicts with scheduled maintenance"`
  5. If clear → call `supabase.from('fleet_loads').update({ driver_id, status: 'assigned' })` + invalidate queries + `toast.success`

### Integration
- Add to `DispatcherDashboard.tsx` between the "Map + Assignment" row and the ActiveLoadsBoard section
- Import and render `<FleetTimelineScheduler />`

### Files
| File | Action |
|---|---|
| `src/components/dispatcher/FleetTimelineScheduler.tsx` | Create |
| `src/pages/DispatcherDashboard.tsx` | Edit — add import + render |


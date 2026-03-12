

## Plan: Pickup/Delivery Time Type (Appointment vs Open Window)

### Task 1: Database Migration

Add two columns to `fleet_loads`:
```sql
ALTER TABLE public.fleet_loads
  ADD COLUMN pickup_time_type text NOT NULL DEFAULT 'appointment',
  ADD COLUMN delivery_time_type text NOT NULL DEFAULT 'appointment';
```

Both default to `'appointment'` so existing loads display unchanged.

### Task 2: Shared Time Type Badge Component

Create `src/components/shared/TimeTypeBadge.tsx` — a reusable component used across all views:
- **Appointment**: Orange badge with `Clock` icon, text "Appt: [Time]"
- **Window**: Green badge with `CalendarRange` icon, text "Window: [Time]"
- Accepts `timeType`, `time`, and optional `variant` (compact for cards, full for forms)
- Includes tooltip on window type: "Open Window means you can arrive any time after the listed start time during normal facility hours."
- Falls back to plain time display when `timeType` is null/undefined

### Task 3: Fleet Loads Form (FleetLoads.tsx)

In the load create/edit dialog, next to the pickup time and delivery time inputs (lines 825-863), add a `Select` for each:
- Options: "Strict Appointment" / "Open Window"
- Store as `pickup_time_type` and `delivery_time_type` in formData
- Default to `'appointment'`
- Also update `handleRateConfirmationData` to pass through these fields if present

In the DataTable columns, update the `pickup_date` column render to include the `TimeTypeBadge` showing the time type alongside the date.

### Task 4: Dispatch Dashboard

**ActiveLoadsBoard.tsx**: In the load card time display area (around line 200+), add `TimeTypeBadge` for pickup/delivery times. Update the query `select` to include `pickup_time_type, delivery_time_type`.

**UpcomingPickups.tsx**: In the pickup time display (lines 139-148), add `TimeTypeBadge` for pickup time type. Update the query to fetch `pickup_time_type`. Update the `UpcomingLoad` interface.

### Task 5: Driver Dashboard

**ActiveLoadCard.tsx**: In the date/time section (lines showing pickup/delivery times), replace plain time text with `TimeTypeBadge`. For appointments: bold "🚨 STRICT APPT: [Time]". For windows: "🟢 OPEN WINDOW: starts at [Time]". Update `Load` interface to include `pickup_time_type` and `delivery_time_type`.

**NextLoadPreview.tsx**: Add time type indicator next to the pickup date display.

**DriverLoadsView.tsx**: Update the load cards to show `TimeTypeBadge` for time displays. Update the query to fetch the new columns.

### Files Modified
- `supabase/migrations/` — new migration for `pickup_time_type` and `delivery_time_type` columns
- `src/components/shared/TimeTypeBadge.tsx` — new shared component
- `src/pages/FleetLoads.tsx` — form inputs + table column
- `src/components/dispatcher/ActiveLoadsBoard.tsx` — query + display
- `src/components/dispatcher/UpcomingPickups.tsx` — query + display
- `src/components/driver/ActiveLoadCard.tsx` — display with driver-specific styling
- `src/components/driver/NextLoadPreview.tsx` — display
- `src/components/driver/DriverLoadsView.tsx` — query + display


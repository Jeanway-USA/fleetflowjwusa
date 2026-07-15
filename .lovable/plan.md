# Support "Open Window" time ranges for Fleet Loads

## 1. Database (migration)

Add two optional columns to `public.fleet_loads`:

- `pickup_end_time text NULL`
- `delivery_end_time text NULL`

Kept as `text` to match the existing `pickup_time` / `delivery_time` columns (they store strings like `"08:00"` / `"8:00 AM"`, per the datetime memory). No RLS/policy changes needed — the existing row policies already cover new columns.

Not touching `pickup_at` / `delivery_at` UTC columns in this pass — those keep pointing at the window START (matches current behavior of `pickup_time`). Window END is display-only for now.

## 2. Time Type dropdown

Extend the two `Select`s in `src/pages/FleetLoads.tsx` (Add/Edit Load modal) to three options:

- `appointment` → Strict Appointment
- `fcfs` → First Come First Served
- `window` → Open Window

Conditional inputs inside the same 3-col grid cell that currently holds the single time input:

- `appointment` → one input, label "Appointment Time", binds to `pickup_time` / `delivery_time`.
- `fcfs` → one input, label "Start Time", binds to `pickup_time` / `delivery_time`.
- `window` → two side-by-side inputs, labels "Window Start" and "Window End", binding to `pickup_time` + new `pickup_end_time` (and delivery counterparts). When the user switches away from `window`, clear the `*_end_time` value on submit.

Persist `pickup_end_time` / `delivery_end_time` in the create + update mutations (both the FleetLoads insert path around line 1105 and the update path around line 690/726).

## 3. Display as a range

Render `HH:MM - HH:MM` whenever an end time exists, otherwise fall back to today's single-time output.

- **`src/components/shared/TimeTypeBadge.tsx`** — accept an optional `endTime` prop; when present, render `Window: 07:00 - 15:00` (full variant), `OPEN WINDOW: 07:00 - 15:00` (driver variant), and keep the tooltip.
- **`src/components/shared/StopTime.tsx`** — accept optional `legacyEndTime` (and, for symmetry, an optional `utcEndIso` we won't populate yet). When provided, render the time line as `start - end` in the stop's zone; secondary "your time" line follows the same range shape.
- **Call sites to update** so they pass the new end time through:
  - `src/pages/FleetLoads.tsx` (table column at line 895, plus any modal summary using `pickup_time` / `delivery_time`)
  - `src/components/dispatcher/UpcomingPickups.tsx`
  - `src/components/dispatcher/ActiveLoadsBoard.tsx`
  - `src/components/driver/ActiveLoadCard.tsx`
  - `src/components/driver/DriverLoadsView.tsx`
  - `src/components/driver/NextLoadPreview.tsx`
  - `src/pages/PublicLoadTracker.tsx`

Each of these currently reads `pickup_time` / `delivery_time` (and often the matching `*_time_type`). They'll additionally read `pickup_end_time` / `delivery_end_time` and forward them to `StopTime` / `TimeTypeBadge`.

## 4. Out of scope

- No changes to `agency_loads`, `load_intermediate_stops`, or the `pickup_at` UTC contract.
- No changes to auto-arrival / geofence / status-email logic — they continue to key off the start time.
- No backfill; existing rows keep `*_end_time = NULL` and render exactly as today.

## Technical notes

- Columns are nullable text to match the existing loose format ("08:00" or "8:00 AM"). Range display uses whatever string is stored (no reformatting).
- TypeScript types regenerate automatically after the migration runs, so the form code that reads `formData.pickup_end_time` compiles once the migration is approved.
- Switching Time Type in the form must reset stale values: `appointment`/`fcfs` → set `*_end_time` to `null`; `window` → keep whatever's there.

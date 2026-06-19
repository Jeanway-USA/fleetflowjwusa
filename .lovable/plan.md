## Goal
Capture a lightweight HOS snapshot when a driver completes a load by extending the existing ending odometer modal. No full ELD — just two number inputs saved to the driver's record.

## Note on target table
The task says "profiles", but driver-domain fields (license, medical, TWIC, emergency contact, etc.) live on `public.drivers` in this project; `profiles` is auth/account-level. Following the established pattern, the new columns will be added to `public.drivers`. Flag if `profiles` was intended.

## Changes

### 1. Migration — `public.drivers`
Add three columns:
- `remaining_drive_hours numeric(4,2)` (nullable; 0–11 typical)
- `remaining_cycle_hours numeric(4,2)` (nullable; 0–70 typical)
- `hos_last_updated timestamptz` (nullable)

Update `prevent_driver_self_sensitive_update` trigger so these three columns are **not** in the blocklist — drivers must be able to write them from the completion modal (similar to `phone` and emergency contact fields, which are already driver-editable).

No RLS change needed (existing `drivers` self-update policy already covers it).

### 2. `src/components/driver/EndingOdometerDialog.tsx`
- Accept new prop: `driverId: string`.
- Add local state `driveHours` and `cycleHours` (strings, parsed via the existing numeric input pattern; allow one decimal).
- Validation: both required, must be numbers `>= 0`. Drive hours capped at `11`, cycle hours capped at `70` (soft cap — show inline helper, block submit if exceeded). `isValid` gates on odometer **and** both HOS fields.
- New section below the odometer block, visually distinct (bordered card, `bg-muted/40`, header "Current HOS Snapshot (For Dispatch)" with a small `Clock` icon and one-line helper "Rough hours only — used for dispatch planning."). Two `DecimalInput`s side-by-side on `sm:` and stacked on mobile.
- Submission:
  - Build the existing `fleet_loads` update exactly as today.
  - In **online** path: after the successful `fleet_loads.update`, run `supabase.from('drivers').update({ remaining_drive_hours, remaining_cycle_hours, hos_last_updated: new Date().toISOString() }).eq('id', driverId)`. If this errors, log + `toast.error('HOS snapshot failed to save')` but do **not** roll back the load (load is already delivered). Invalidate `['driver-for-user']` so any HOS UI refreshes.
  - In **offline** path: enqueue a second offline action `driver_hos_update` with `{ id: driverId, remaining_drive_hours, remaining_cycle_hours, hos_last_updated: <ISO now> }` alongside the existing `load_status_update` enqueue.

### 3. `src/hooks/useOfflineQueue.ts`
- Add a handler branch for the new `driver_hos_update` action type that performs the `drivers` update when the queue flushes. (Read the file first to match the existing handler shape — same pattern as `load_status_update`.)

### 4. `src/components/driver/ActiveLoadCard.tsx` (caller)
- Pass `driverId` prop through to `EndingOdometerDialog` (it already has the driver context from `DriverDashboard` → `ActiveLoadCard` props).

## Out of scope
- No dispatcher-side UI to display the HOS snapshot in this task — purely capture. (Easy follow-up: surface `remaining_drive_hours` + `hos_last_updated` on the dispatcher Driver Status grid.)
- No changes to the starting odometer dialog.
- No HOS history table — only the latest snapshot on `drivers` per the spec.

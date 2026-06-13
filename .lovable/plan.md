# Odometer Capture on Driver Status Transitions

## Mapping to existing schema
The `fleet_loads` table already has the integer columns `start_miles` and `end_miles` (used by the dispatcher form). The driver UI just never wrote to them. We will reuse those columns rather than creating new `starting_odometer` / `ending_odometer` fields. **No database migration is required.**

## Where the intercept happens
Two driver components currently call `supabase.from('fleet_loads').update({ status })` directly when the driver advances a load:

- `src/components/driver/ActiveLoadCard.tsx` — the "active load" card on the Driver Dashboard.
- `src/components/driver/DriverLoadsView.tsx` — the full load list / detail screen.

Both share the same status progression: `pending → assigned → loading → in_transit → delivered`. The relevant transitions to intercept are:

- `loading → in_transit` (driver taps **Loaded & Departing**) → **Starting Odometer** dialog.
- `in_transit → delivered` (driver taps **Mark Delivered**) → **Ending Odometer** capture.

## New components

### 1. `src/components/driver/StartingOdometerDialog.tsx`
A shadcn `Dialog` with a single required field.

- Title: "Starting Odometer".
- Description: "Please enter your starting odometer reading to begin this load."
- One input — `inputMode="numeric"`, `pattern="[0-9]*"`, masked to digits only on change (consistent with the new `IntegerInput` primitive shipped earlier this session).
- Submit is disabled until the value is a positive integer.
- On submit: a single Supabase update — `{ status: 'in_transit', start_miles: <int>, in_transit_at: now() }` (we already set `in_transit_at` on this transition elsewhere — keep that behavior). Toast on success, error toast on failure, dialog stays open on failure.
- Offline path: enqueue the same payload via the existing `useOfflineQueue` so we don't lose the reading.

### 2. `src/components/driver/EndingOdometerDialog.tsx`
Same shape as the starting dialog, plus validation.

- Title: "Ending Odometer".
- Receives `startMiles: number | null` as a prop.
- Inline red error text under the field when the entered value is ≤ `startMiles` ("Ending odometer must be greater than starting odometer (XX,XXX mi).").
- If `startMiles` is null (legacy load without a starting reading), allow any positive integer and show a subtle muted note explaining no starting value was recorded.
- On submit: update `{ status: 'delivered', end_miles: <int>, actual_miles: end_miles - start_miles }` (only set `actual_miles` when `start_miles` is present). Same offline-queue fallback.

## Wiring into the two driver views

For both `ActiveLoadCard.tsx` and `DriverLoadsView.tsx`, modify `handleProgressStatus` so that:

1. If `nextStatus === 'in_transit'`, open `StartingOdometerDialog` instead of running the direct update. The dialog owns the write and then calls `onStatusUpdate()`.
2. If `nextStatus === 'delivered'`:
   - **POD required** (`load.pod_required !== false`): open the existing `ProofOfDeliveryDialog`, and add an "Ending Odometer" required field at the top of that dialog so the driver isn't hit with two modals in a row. The POD submit handler already issues one `update({ status: 'delivered', ... })` — we'll add `end_miles` and `actual_miles` to that same payload and refuse submit if the value isn't > `start_miles`.
   - **POD not required**: open the new `EndingOdometerDialog`, which owns the status write.
3. All other transitions (`pending → assigned`, `assigned → loading`) stay as-is — no odometer prompt.

## Validation rules (enforced client-side)

| Field            | Rule                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| Starting Odometer | Integer ≥ 1. Non-digits stripped on input. Submit disabled if blank. |
| Ending Odometer   | Integer ≥ 1, AND `> load.start_miles` (when present). Red error text on violation. |

We rely on `IntegerInput` for masking (already exists in `src/components/ui/numeric-input.tsx`); both dialogs render it with `inputMode="numeric"` so iOS / Android show the numeric keypad in-cab.

## Loading types

`Load` interfaces in both `ActiveLoadCard.tsx` and `DriverLoadsView.tsx` need `start_miles: number | null` and `end_miles: number | null` added. The list query on the Driver Dashboard / Loads view selects `*` from `fleet_loads`, so no SQL change is needed — just the TypeScript surface.

## Out of scope
- Editing odometer values after the fact from the driver UI (dispatcher edit screen already handles that in `FleetLoads.tsx`).
- Backfilling missing odometers on historical loads.
- Showing the captured odometer on the driver's delivered-load card (can be a follow-up).

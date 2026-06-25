## Goal
Let admins explicitly set both ends of the pay period when generating settlements, so the period reflects exactly what they entered (e.g., Jun 23 – Jun 26).

## Root cause
The Generate Settlements dialog only collects **one date** (`periodEnd`) and calls the RPC `generate_driver_settlements(_driver_ids, _period_end, _payment_date)`. The SQL function derives `period_start` automatically as "day after the last settlement, else first activity, else hire date." For Timothy Ames there was no prior settlement and the only activity row's pickup date is Jun 23, so `period_start = period_end = Jun 23`. Even though the user intended a Jun 23 – Jun 26 window, the UI gave them no way to express it.

## Fix

### 1. Database migration — add `_period_start` parameter to the RPC
- `CREATE OR REPLACE FUNCTION public.generate_driver_settlements(_driver_ids uuid[], _period_start date, _period_end date, _payment_date date)` with the same return type.
- Behavior:
  - If `_period_start` is provided, use it verbatim — skip the auto-derivation block entirely.
  - If `_period_start` is NULL, keep the existing auto-derivation fallback (day after last settlement → first activity → hire date) for backward compatibility.
  - Validate `_period_start <= _period_end` (raise exception otherwise).
- All `BETWEEN _period_start AND _period_end` queries and the flat-rate overlap check already use `_period_start`, so they pick up the new value automatically.
- Drop the prior signature with `DROP FUNCTION IF EXISTS public.generate_driver_settlements(uuid[], date, date);` so PostgREST routes to the new one without ambiguity.

### 2. Generate Settlements dialog — collect both dates
File: `src/components/finance/driver-settlements/GenerateSettlementsDialog.tsx`
- Add `periodStart` state (default: 6 days before `periodEnd`, mirroring a typical weekly cycle).
- Render a "Pay Period Start" date picker next to the existing "Pay Period End" picker (two-column grid on desktop, stacked on mobile).
- Validate `periodStart <= periodEnd` before submitting; show inline error if not.
- Pass `_period_start: format(periodStart, 'yyyy-MM-dd')` in the RPC call alongside the existing `_period_end` and `_payment_date`.
- Reset `periodStart` whenever the dialog reopens.

### 3. No other surfaces affected
- The PDF generator, detail sheet, and dashboard table already read `period_start` from the row and will display the correct range automatically once the row is stored properly.

## Verification
- Generate a new settlement for Timothy Ames with start = Jun 23, end = Jun 26, payment = Jun 26.
- Confirm the saved row stores `period_start = 2026-06-23`, `period_end = 2026-06-26`.
- Open the PDF and confirm the period strip reads "Jun 23, 2026 - Jun 26, 2026".
- Re-run a generation with `_period_start` omitted from a manual SQL call to confirm the auto-derivation fallback still works.

## Technical Details
- One new migration that `DROP`s the old 3-arg signature and `CREATE OR REPLACE`s the 4-arg signature with the new optional `_period_start`.
- One UI file edit to add the second date picker and pass the new arg.
- No schema/table changes; `driver_settlements` already has `period_start`.

## Problem

Truck **433780** still shows on the Safety page as needing inspection. Its `next_inspection_date` in the database is `2026-04-11` (expired), but a completed inspection work order exists with `entry_date = 2026-04-09` and `completed_at = 2026-04-10`. The expected next inspection date should be `2026-08-07` (120 days after the inspection).

## Root cause

The recent client-side fix in `useCompleteWorkOrder` (which auto-advances `next_inspection_date` by 120 days when an inspection work order is completed) only runs for **new** completions going forward. The April 10 completion happened before that fix shipped, so this truck's record was never updated. Any other path that flips a work order to `completed` (bulk updates, prior code paths, manual edits) also bypasses the client logic.

## Plan

### 1. Add a Postgres trigger on `work_orders` (single source of truth)

Create `AFTER INSERT OR UPDATE` trigger on `work_orders` that fires when:
- `status` becomes `'completed'`, AND
- `service_type = 'inspection'` OR `'inspection' = ANY(service_types)`

The trigger function:
- Picks the inspection date: `COALESCE(NEW.estimated_completion, NEW.entry_date, NEW.completed_at::date)`.
- Sets `trucks.next_inspection_date = inspection_date + interval '120 days'` for `trucks.id = NEW.truck_id`.
- Only updates if the new date is later than the existing `next_inspection_date` (so we never accidentally pull a date earlier than what's stored).

This guarantees correctness regardless of how a work order is completed (UI, bulk import, future code paths).

### 2. One-time backfill

Run a single migration statement that, for every truck, looks at its most recent completed inspection work order and sets `next_inspection_date = inspection_date + 120 days` when that result is later than the currently stored value. This will immediately fix truck 433780 and any other trucks in the same state.

### 3. Keep the existing client logic

Leave the `useCompleteWorkOrder` / `useRevertWorkOrder` updates in `src/hooks/useMaintenanceData.ts` as-is. They remain useful for instant UI feedback and offline behavior; the trigger acts as a safety net.

### 4. Verification

- Re-query truck 433780: `next_inspection_date` should be `2026-08-07`.
- Reload `/safety`: truck should drop off the Inspections alert list.
- Complete a fresh test inspection work order on another truck and confirm both client cache and DB row update.

## Out of scope

- No changes to the Safety page UI.
- No changes to the 120-day interval (matches current product logic).
- No changes to other work-order types (PM, repair, etc.).

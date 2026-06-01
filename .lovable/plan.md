## Goal

Make the Weekly Goals section of Driver Settings adapt to the driver's `pay_type`, and ensure saves persist `goal_type` and `target_miles` correctly.

## Behavior

`driver.pay_type` values in this codebase: `'flat'`, `'cpm'` / `'per_mile'`, `'percentage'`, `'hourly'`. The "Flat Rate" label corresponds to `pay_type === 'flat'`.

In `src/pages/DriverSettings.tsx`:

1. The `driver` query already returns `pay_type` (uses `select('*')`). No fetch change needed beyond reading `driver.pay_type`.

2. Replace the existing two-column grid (Miles Goal + Revenue Goal) and the separate Target Miles input with conditional rendering driven by `pay_type`:

   - **Flat Rate (`pay_type === 'flat'`)**
     - Hide the dollar-amount (Weekly Revenue Goal) input entirely.
     - Show a single **"Weekly Mileage Target"** number input bound to `targetMiles` (with miles suffix).
     - Subtext under it: *"Pace yourself to hit 2,500 safe miles per week to ensure you unlock your 10,000-mile monthly safety bonus."*
     - Also hide the "Primary Goal Type" selector (force `goalType = 'mileage'` for flat drivers; not user-selectable).
     - Keep the existing `weeklyMilesGoal` state in sync with `targetMiles` so legacy reads still work.

   - **All other pay types (CPM/per_mile, percentage, hourly)**
     - Keep the current layout: Primary Goal Type selector + both Miles Goal and Revenue Goal inputs + Target Miles input (shown when Goal Type = Mileage, otherwise the Revenue Goal is the primary).
     - To reduce clutter, only show the input that matches the selected goal type, plus the goal-type selector — i.e. Mileage → Target Miles; Financial → Weekly Revenue Goal. Drop the redundant "Weekly Miles Goal" field (its value is preserved in DB; UI keeps it equal to `targetMiles`).

3. **Save** (`saveGoalsMutation`) — already wired to write `goal_type` and `target_miles`. Adjust `handleSaveGoals` so that:
   - For flat drivers: force `goal_type = 'mileage'`, set `weekly_miles_goal = targetMiles`, and leave `weekly_revenue_goal` as the previously loaded value (or 0 if absent).
   - For other drivers: send the user-selected `goalType` and current input values.

4. Update the on-load `useEffect` so flat drivers default `goalType` to `'mileage'` and `targetMiles` to `settings.target_miles ?? settings.weekly_miles_goal ?? 2500` regardless of stored goal type.

## Files touched

- `src/pages/DriverSettings.tsx` — only file changed.

## Verification

- Driver with `pay_type = 'flat'`: Weekly Goals shows just the Mileage Target input + safety-bonus subtext; Save persists `goal_type='mileage'` and `target_miles`.
- Driver with `pay_type = 'percentage'` or `'cpm'`: sees goal-type selector and the matching single input; Save persists chosen `goal_type` plus the corresponding numeric target.
- Existing data on the dashboard pay widget continues to render correctly (it already reads `goal_type` / `target_miles`).

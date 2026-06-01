## Goal

Extend driver goal settings to support a goal **type** (financial vs mileage) and an explicit `target_miles` column, while keeping the existing revenue/miles goal fields intact for backward compatibility.

## Schema changes (`driver_settings` table)

There is no `weekly_goals` table in this project — driver goals live on `public.driver_settings` (read via the `driver_settings_safe` view). Changes will be applied there.

Add two columns:

1. `goal_type text not null default 'financial'`
   - CHECK via validation trigger (per project convention — no CHECK constraints) limiting values to `'financial'` or `'mileage'`.
2. `target_miles integer` (nullable, no default)

Keep existing columns untouched:
- `weekly_miles_goal` (int)
- `weekly_revenue_goal` (int)
- `pay_week_start_day` (int)

Also update the `driver_settings_safe` view to expose `goal_type` and `target_miles` so the client (which reads from the safe view) can see them. Re-grant SELECT on the view to `authenticated`.

No RLS/GRANT changes needed on the base table — existing policies already cover it.

## Code changes

1. **`src/pages/DriverSettings.tsx`** — `saveGoalsMutation`
   - Add `goalType` state (`'financial' | 'mileage'`) and `targetMiles` state.
   - Load from `settings.goal_type` / `settings.target_miles` in the `useEffect`.
   - Include `goal_type` and `target_miles` in both `.update()` and `.insert()` payloads.
   - Add a small UI control (Select) for "Goal Type" in the Weekly Goals card, and conditionally emphasize the miles vs revenue input based on selection (both inputs remain editable so historical values are preserved).
   - Select the new fields in the settings query.

2. **`src/components/driver/DriverPayWidget.tsx`**
   - Select `goal_type` and `target_miles` alongside the existing goals.
   - When `goal_type === 'mileage'`, use `target_miles ?? weekly_miles_goal` as the progress goal and force progress to be miles-based; otherwise keep the current pay-type-driven behavior (financial uses `weekly_revenue_goal`).

3. **`src/integrations/supabase/types.ts`** — auto-regenerates after the migration runs; no manual edit.

## Verification

- Open Driver Settings as a driver, toggle Goal Type, set values, Save → no RLS error, row persists with new fields.
- Driver Dashboard pay widget reflects the chosen goal type in the progress bar and label.
- Existing drivers (no `goal_type` row yet) default to `'financial'` and continue to behave as today.

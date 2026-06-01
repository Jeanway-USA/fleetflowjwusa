# Remove Fuel Planning Feature

Completely remove the Fuel Planning / Trip Fuel Planner feature from the app.

## Frontend

- `src/components/driver/TripFuelPlanner.tsx` — delete file
- `src/components/driver/fuel-planner/FuelPlannerMap.tsx` — delete file (and the empty `fuel-planner/` folder)
- `src/pages/DriverDashboard.tsx` — remove `TripFuelPlanner` import and the `{activeLoad && <TripFuelPlanner ... />}` block
- `src/components/shared/CommandPalette.tsx` — remove `'fuel_planner'` from each tier's feature Set
- `src/components/layout/AppSidebar.tsx` — remove `'fuel_planner'` from each tier feature list
- `src/hooks/useSubscriptionTier.ts` — remove `'fuel_planner'` from each tier's TIER_FEATURES array
- `src/pages/DriverSettings.tsx` — remove the "Landstar Portal Credentials" card (lines ~355–415) plus the related query, mutation, and state (`landstar-credentials` query, `setLandstarUsername`, save/clear handlers). This section exists solely to feed LCAPP fuel discounts to the planner; with the planner gone it has no purpose.

## Backend

- `supabase/functions/landstar-fuel-stops/` — delete the edge function code, then call `supabase--delete_edge_functions` for `landstar-fuel-stops`
- `supabase/config.toml` — remove the `[functions.landstar-fuel-stops]` block
- `supabase/functions/manage-credentials/` — used only for storing Landstar credentials for the planner. Delete the function and its config, and call `supabase--delete_edge_functions` for `manage-credentials`.

## Database

No destructive migration. The `driver_credentials`-style table (if any) and stored encrypted creds will simply go unused. Leaving the table in place avoids data loss and keeps the migration list clean. If you'd rather drop the table too, say so and I'll add a migration.

## Memory

Update `mem://features/driver/fuel-trip-planner` and the corresponding line in `mem://index.md` to mark the feature as removed (or delete the memory file and its index entry).

## Out of scope

- IFTA fuel purchases/tracking — unrelated, stays as is.
- Driver `DocumentScanButton`, GPS sharing, pay widgets — untouched.

Confirm and I'll implement.

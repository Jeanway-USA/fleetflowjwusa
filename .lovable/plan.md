## Problem

The Edit Load dialog on `/fleet-loads` fails with:
> Could not find the 'driver_name' column of 'fleet_loads' in the schema cache

`driver_name` and `truck_unit` are computed display-only fields that `FleetLoads.tsx` adds to each load row (lines 535–544) so the table can sort/filter by driver and truck. When a user clicks edit, `openDialog(load)` seeds `formData` with that enriched row, and on save `handleSubmit` does `{ ...formData, ...calculated, org_id }` — pushing the synthetic `driver_name` / `truck_unit` keys into the Supabase `update()` / `insert()` payload. PostgREST then rejects the request because those columns don't exist on `fleet_loads`.

## Fix

Strip the non-column synthetic fields before they ever reach the database, in `src/pages/FleetLoads.tsx`:

1. In `openDialog`, when seeding `formData` from an existing load, omit `driver_name` and `truck_unit` (and any other enrichment-only keys) so the form state stays clean.
2. As a belt-and-suspenders guard in `handleSubmit`, also delete those keys from the final `payload` before calling `updateMutation.mutate` / `createMutation.mutate`. This protects both Edit and Add New Load paths in case other enrichment fields get added later.

No DB changes, no schema work, no edits to the edit dialog UI. Purely the payload sanitation in this one file.

## Out of scope

- The enrichment itself (`driver_name`, `truck_unit`) stays — it's used by the loads table column/sort/filter.
- No changes to create/update mutations, RLS, or other pages.

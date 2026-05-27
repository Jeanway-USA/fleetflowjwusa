## Problem
Adding a truck fails with `new row violates row-level security policy for table "trucks"`. The trucks table requires `org_id = get_user_org_id(auth.uid())` on insert, but the form (`src/pages/Trucks.tsx`) inserts the truck without setting `org_id`, so RLS rejects it.

Other tables (e.g. `maintenance_requests`) solve this with a `BEFORE INSERT` trigger that auto-fills `org_id` from the user's profile. Trucks has no such trigger.

## Fix
Add a database trigger that auto-populates `org_id` on new `trucks` rows from the authenticated user, so RLS passes without requiring the client to know the org.

### Migration
1. Create `public.set_trucks_org_id()` — security-definer function that sets `NEW.org_id := public.get_user_org_id(auth.uid())` when null.
2. Create `BEFORE INSERT` trigger `set_trucks_org_id_trg` on `public.trucks`.

No code changes, no UI changes, no policy changes.

### Why not edit the client
Setting `org_id` client-side works but every insert site (Trucks page, Onboarding, undo-restore, etc.) would need to remember it. A trigger matches the pattern already used elsewhere in this project and prevents recurrence.

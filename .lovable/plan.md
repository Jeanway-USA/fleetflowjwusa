# Fix RLS violation on driver create

## Problem

`drivers.org_id` is `NOT NULL` and the insert policy requires `org_id = get_user_org_id(auth.uid())`. The createMutation in `src/pages/Drivers.tsx` inserts the form payload as-is without an `org_id`, so Postgres rejects the row with "new row violates row-level security policy for table drivers".

## Change

In `src/pages/Drivers.tsx`, attach the current user's `orgId` (already pulled from `useAuth()`) to the insert payload:

```ts
const { error } = await supabase
  .from('drivers')
  .insert({ ...driver, org_id: orgId });
```

Also guard the mutation so it doesn't fire before `orgId` is loaded (throw an error if missing).

No DB, RLS, or other UI changes.

## Verification

Add a new driver as a JeanWay USA owner with Flat Rate 1700 — save succeeds and the driver appears in the list scoped to the org.

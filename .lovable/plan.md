# Fix: Cannot delete from table "driver_locations"

## Root cause

When the super admin runs `super_admin_delete_org`, the function tries `DELETE FROM public.driver_locations WHERE org_id = ...`. Postgres rejects it with:

```
cannot delete from table "driver_locations"
DETAIL: Column used in the publication WHERE expression is not part of the replica identity.
```

`driver_locations` is part of the `supabase_realtime` publication with a row filter that references a column (e.g. `is_sharing`/`org_id`) not covered by the table's default replica identity (PK `id` only). Postgres blocks UPDATE/DELETE in that situation. Nothing is wrong with the RPC, RLS, or grants — it's a replication-identity configuration issue introduced when realtime was enabled with a filter.

## Fix

Single migration that widens the replica identity so realtime can log the filtered column on deletes:

```sql
ALTER TABLE public.driver_locations REPLICA IDENTITY FULL;
```

`REPLICA IDENTITY FULL` makes Postgres include all columns of the old row in the WAL, which satisfies the publication's WHERE expression requirement. It's the standard fix for this exact realtime error and has no functional impact on the app — only a small WAL-size increase for a low-volume table.

## Verification

After the migration:
1. From `/super-admin`, click the row actions menu on the "Testing Company" org and confirm Delete Organization.
2. The toast should now read "Organization 'Testing Company' deleted" and the row disappears.
3. Re-run `super_admin_reset_demo` (Reset Demo dialog) to confirm the same path works for the demo org reset.

## Out of scope

- No changes to RLS, grants, the RPC body, or the frontend.
- Not altering the realtime publication itself (the filter is intentional for live driver location sharing).

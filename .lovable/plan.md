

# Fix: "new row violates row-level security policy for table load_accessorials"

## Root Cause

When inserting into `load_accessorials` (both during create and update), the code does not include `org_id` in the record. The RLS policy requires `org_id = get_user_org_id(auth.uid())`, so the insert is rejected.

## Fix

### File: `src/pages/FleetLoads.tsx`

Add `org_id` to all `load_accessorials` insert operations. The `org_id` is already available from the `fleet_loads` record (or from `AuthContext`). There are two places to fix:

1. **Create mutation (line ~125-131)**: Add `org_id` from the newly created load's `org_id` to each accessorial record.
2. **Update mutation (line ~155-161)**: Add `org_id` to each accessorial record during the delete-and-reinsert flow.

Both spots follow the same pattern -- just spread `org_id` into the accessorial insert objects. The `org_id` can come from the parent `fleet_loads` record (which already has it) or from `useAuth().orgId`.


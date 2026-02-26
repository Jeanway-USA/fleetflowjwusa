

## Fix: Work Order Creation Fails Due to Missing `org_id`

### Problem
The RLS policy on the `work_orders` table requires `org_id = get_user_org_id(auth.uid())` for inserts. However, the `useCreateWorkOrder` mutation in `src/hooks/useMaintenanceData.ts` does not include `org_id` in the insert payload. This causes every work order creation to be rejected with a row-level security violation.

### Root Cause
The insert statement at line 866 of `useMaintenanceData.ts` omits the `org_id` field entirely. The column has no default that auto-populates from the authenticated user, so it inserts as `null`, which fails the RLS `with_check` condition.

### Fix

**File: `src/hooks/useMaintenanceData.ts`** (lines 864-877)

Add a call to `get_user_org_id` (or fetch it client-side) before inserting, and include `org_id` in the insert payload.

The simplest approach: use `supabase.rpc('get_user_org_id', { uid: user.id })` to fetch the org_id, then pass it in the insert. Alternatively, since other parts of the codebase likely use a profile lookup, we can query the user's org_id from their profile or use the SQL function directly in a database default.

**Recommended approach -- set a column default on `org_id`** via a migration so every insert automatically gets the correct value without client-side changes:

```sql
ALTER TABLE public.work_orders 
ALTER COLUMN org_id SET DEFAULT get_user_org_id(auth.uid());
```

This is the cleanest fix: no client code changes needed, and it ensures `org_id` is always set correctly for any insert path (including future ones).

### Changes Summary

| What | Detail |
|------|--------|
| **Database migration** | Set default on `work_orders.org_id` to `get_user_org_id(auth.uid())` |
| **No code changes needed** | The existing insert in `useMaintenanceData.ts` will automatically get the correct `org_id` from the column default |


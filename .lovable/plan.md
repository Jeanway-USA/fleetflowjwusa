

## Fix: "Failed to update location" -- Missing `org_id` in Upsert Payload

### Problem
The `driver_locations` table has an RLS policy that requires `org_id = get_user_org_id(auth.uid())` on both SELECT and INSERT/UPDATE. However, the `LocationSharing` component's upsert payload does not include `org_id`. The row is inserted with `org_id = NULL`, which violates the RLS `WITH CHECK` condition, causing the mutation to fail.

### Fix

**Edit `src/components/driver/LocationSharing.tsx`:**

Before building the upsert payload, fetch the current user's `org_id` from `profiles` and include it in the payload. Since we already have access to the authenticated user context, we can query the org_id once.

Specifically:
1. Import `useAuth` from the auth context
2. Add a query to fetch the user's `org_id` from the `profiles` table
3. Include `org_id` in the `locationPayload` object passed to the upsert

The minimal change is to add `org_id` to the mutation payload:

```typescript
// In the component, add a query for org_id:
const { user } = useAuth();

const { data: profile } = useQuery({
  queryKey: ['user-org', user?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('user_id', user?.id)
      .single();
    return data;
  },
  enabled: !!user?.id,
});

// Then in the locationPayload, add:
org_id: profile?.org_id || null,
```

### Files Changed

| File | Action |
|------|--------|
| `src/components/driver/LocationSharing.tsx` | Add org_id to upsert payload |


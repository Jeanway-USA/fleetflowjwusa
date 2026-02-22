

## Fix: Ambiguous RPC Call for Organization Update

### Problem

There are two overloads of `super_admin_update_org` in the database (3-param and 4-param versions). When the RPC is called without all parameters, Postgres cannot determine which function to use.

### Solution

Update `src/components/superadmin/OrgDetailSheet.tsx` to always pass all four parameters (`target_org_id`, `new_tier`, `new_is_active`, `new_trial_ends_at`) in the RPC call, using `null` for any that aren't being changed. This removes the ambiguity.

### Technical Details

**File: `src/components/superadmin/OrgDetailSheet.tsx`** (line ~35)

Change the `mutationFn` from:
```ts
await supabase.rpc('super_admin_update_org', {
  target_org_id: org.id,
  new_tier: newTier ?? null,
  new_is_active: newIsActive ?? null,
});
```

To:
```ts
await supabase.rpc('super_admin_update_org', {
  target_org_id: org.id,
  new_tier: newTier ?? null,
  new_is_active: newIsActive ?? null,
  new_trial_ends_at: newTrialEndsAt ?? null,
});
```

Also update the mutation call signature to accept `newTrialEndsAt` as an optional parameter (it may already be used elsewhere in this component for trial date changes).

Additionally, drop the redundant 3-parameter overload via a migration so this ambiguity doesn't recur.

### Changes Summary

| File | Change |
|------|--------|
| `src/components/superadmin/OrgDetailSheet.tsx` | Always pass all 4 RPC params including `new_trial_ends_at` |
| Database migration | Drop the old 3-param overload of `super_admin_update_org` |


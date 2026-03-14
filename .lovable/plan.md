

## Fix: Mismatched RPC Parameter Name

### Problem
The client calls `super_admin_update_org` with parameter `new_tier`, but the database function expects `new_subscription_tier`. PostgREST can't match the function signature.

### Solution
In `src/components/superadmin/OrgDetailSheet.tsx` line 34, rename `new_tier` to `new_subscription_tier`.

| File | Change |
|------|--------|
| `src/components/superadmin/OrgDetailSheet.tsx` | `new_tier` → `new_subscription_tier` on line 34 |


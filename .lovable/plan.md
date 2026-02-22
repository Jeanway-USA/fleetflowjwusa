

## Fix: Settlement Creation RLS Error

The error "new row violates row-level security policy for table settlements" occurs because `org_id` is not included in the insert payload when creating a settlement. The RLS policy requires `org_id = get_user_org_id(auth.uid())`.

### Root Cause

In `src/components/finance/SettlementsTab.tsx`, the `createMutation` inserts a settlement without setting `org_id`. The component does not import `useAuth` or access `orgId` at all.

### Fix

**File: `src/components/finance/SettlementsTab.tsx`**

1. Import `useAuth` from `@/contexts/AuthContext`
2. Destructure `orgId` from `useAuth()` inside the component
3. Add `org_id: orgId` to the settlement insert payload (line ~343)
4. Also add `org_id: orgId` to the line items insert if the `settlement_line_items` table has the same RLS requirement

This is a small, targeted fix -- just adding the missing `org_id` field to comply with existing RLS policies.



# Fix: "new row violates row-level security policy for table fleet_loads"

## Root Cause

The `fleet_loads` INSERT uses an "ALL" policy with `WITH CHECK (org_id = get_user_org_id(auth.uid()))`. The load payload constructed in `handleSubmit` does not include `org_id`, so the RLS check fails.

## Fix

### File: `src/pages/FleetLoads.tsx`

1. Destructure `orgId` from `useAuth()` (line ~49, already imports `useAuth`).
2. In `handleSubmit` (line ~304), add `org_id: orgId` to the `payload` object so the inserted row satisfies the RLS WITH CHECK condition.

This is a one-line addition to the payload construction.

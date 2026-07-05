## Issue
`W2DriverSyncDashboard` queries `drivers` without an explicit `org_id` filter, so a driver from another organization (Andrew Baker) is showing alongside the correct one (Timothy Ames).

## Fix
Scope the drivers query to the current user's organization.

1. In `src/components/payroll/W2DriverSyncDashboard.tsx`:
   - Resolve the caller's `org_id` (via `useAuth()` / existing profile hook already used elsewhere in the app, e.g. `AuthContext`).
   - Add `.eq('org_id', orgId)` to the `drivers` select.
   - Gate the query with `enabled: !!orgId` and include `orgId` in the `queryKey` so it refetches on org change / impersonation.

No backend/RLS changes — just tightening the client query to match the tenant scope pattern used across the rest of the app.
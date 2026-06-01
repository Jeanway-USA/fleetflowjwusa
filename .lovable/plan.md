# Fix: Role assignment fails with RLS error

## Root cause

The `user_roles` RLS policies require `org_id = get_user_org_id(auth.uid())` in their `WITH CHECK` clause for both INSERT and UPDATE. The Team Management mutations in `src/components/settings/TeamManagementTab.tsx` insert and update rows without supplying `org_id`, so the row's `org_id` is NULL and the policy check fails with `new row violates row-level security policy for table "user_roles"`.

This affects:
- "Assign Role" dialog (`assignRoleMutation`, line ~140)
- "Edit User" dialog role change (line ~200, ~203)
- Also: the lookup at line 135 uses `.maybeSingle()` without filtering by org, which can return a role row from a different org and then attempt an UPDATE that RLS will reject.

## Changes (frontend only)

In `src/components/settings/TeamManagementTab.tsx`:

1. **assignRoleMutation** (~line 133–143):
   - Scope existing-role lookup to current org: `.eq('user_id', userId).eq('org_id', orgId)`.
   - On INSERT, include `org_id: orgId`.
   - On UPDATE, also include `org_id: orgId` in the SET (defensive — keeps row aligned with current org context).
   - Guard: throw early if `orgId` is null.

2. **handleEditUser** (~line 198–206):
   - When inserting a new role row, include `org_id: orgId`.
   - UPDATE by `id` is fine (row already has matching org_id), no change needed beyond the orgId guard.

No database/policy changes. No backend changes. No UI/copy changes.

## Verification

- Reproduce: as owner, open Team Management → Assign Role on a member with no role row → confirm success toast and role appears.
- Edit existing user role → confirm update succeeds.
- Confirm non-owners still cannot assign roles (policy unchanged).

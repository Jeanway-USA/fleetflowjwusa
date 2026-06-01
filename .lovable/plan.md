## Issue

The current error is no longer the previous RLS failure. The live database already contains a `driver` role row for `amestimothy1996@gmail.com`, but that row has a missing `org_id`. Because `user_roles` still has a unique constraint on `(user_id, role)`, trying to assign `driver` again creates a duplicate-key error instead of updating the existing row.

## Plan

1. **Repair the bad existing role row**
   - Backfill the missing `org_id` on existing `user_roles` rows from each user’s `profiles.org_id`.
   - This specifically fixes the currently affected invited driver row.

2. **Fix the invitation acceptance function**
   - Update `supabase/functions/accept-invitation/index.ts` so accepted invitations insert/upsert `user_roles` with `org_id: invite.org_id`.
   - This prevents future accepted invitations from creating role rows with a blank org.

3. **Make Assign Role resilient**
   - Update `src/components/settings/TeamManagementTab.tsx` so role assignment checks for an existing role by `user_id + role` as a fallback if the org-scoped lookup misses it.
   - If a matching role exists with a missing `org_id`, update that row instead of inserting a duplicate.
   - Keep normal org-scoped updates for correctly formed rows.

4. **Validate**
   - Confirm the affected user’s `user_roles` row now has the correct `org_id`.
   - Confirm future accepted invitations write `org_id` correctly.
   - Confirm Assign Role no longer hits the duplicate-key path.
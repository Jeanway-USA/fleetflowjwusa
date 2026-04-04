

## Fix: Foreign Key Constraint Error When Deleting/Deactivating Organizations

### Root Cause

The `user_roles` table has a foreign key `org_id REFERENCES organizations(id)` **without** `ON DELETE CASCADE`. When the super admin tries to delete or deactivate an organization, two paths fail:

1. **`super_admin_update_org`** (deactivate + auto-delete empty orgs): Attempts `DELETE FROM organizations` without first clearing `user_roles` rows for that org.
2. **`super_admin_delete_org`** (manual delete): Deletes `user_roles` by joining on `profiles.org_id`, but if some `user_roles` rows reference the org directly via `user_roles.org_id`, those are missed.

### Fix — Single Migration

Update both RPC functions to delete `user_roles WHERE org_id = target_org_id` before deleting the organization.

**`super_admin_delete_org`** — add `DELETE FROM public.user_roles WHERE org_id = target_org_id;` before the existing profiles-based delete (replace the join-based delete entirely since the direct `org_id` match is more reliable).

**`super_admin_update_org`** — in the auto-delete block (when `new_is_active = false` and no profiles remain), add `DELETE FROM public.user_roles WHERE org_id = target_org_id;` before the `DELETE FROM organizations` statement.

### Files
- **New migration SQL** — recreates both functions with the `user_roles` cleanup fix.


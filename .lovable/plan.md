## Goal

1. Make org-owner user deletion fully remove the account site-wide (auth + all data references).
2. Delete the account `ajb06.jrb07@gmail.com` (id `e089acf0-2a1b-498d-ad04-fa39b40d05e1`) now.

## Why the previous attempt failed

The edge function tried `supabase.auth.admin.deleteUser(userId)` but it returned `Database error deleting user`. Postgres logged:

```
null value in column "user_id" of relation "audit_logs" violates not-null constraint
```

`audit_logs.user_id` has since been made nullable (prior migration), so that specific cause is fixed. However the `delete-user` function still doesn't clean up other tables that reference the user before calling auth deletion, and there are a few FK paths that don't cascade automatically:

- `public.changelog.created_by` → `auth.users(id)` with **no ON DELETE action** (blocks deletion if user authored any changelog).
- `public.documents.uploaded_by`, `public.drivers.user_id`, `public.load_status_logs.changed_by` → ON DELETE SET NULL (safe, but leave orphan rows).
- `public.crm_activities.user_id`, `public.maintenance_request_messages.sender_user_id`, `public.user_feedback.user_id`, `public.document_templates.created_by`, `public.super_admin_audit_logs.user_id` → no FK to `auth.users`, become dangling references.
- `public.profiles`, `public.user_roles`, `public.super_admins` already CASCADE.

## Plan

### 1. Harden `supabase/functions/delete-user/index.ts`

Before calling `auth.admin.deleteUser`, perform a full purge with the service-role client, in this order (each wrapped in try/catch with logging so a single failure doesn't abort the rest):

1. `DELETE FROM crm_activities WHERE user_id = $userId`
2. `DELETE FROM maintenance_request_messages WHERE sender_user_id = $userId`
3. `DELETE FROM user_feedback WHERE user_id = $userId`
4. `UPDATE documents SET uploaded_by = NULL WHERE uploaded_by = $userId`
5. `UPDATE document_templates SET created_by = NULL WHERE created_by = $userId`
6. `UPDATE changelog SET created_by = NULL WHERE created_by = $userId` (or delete, depending on org scope)
7. `UPDATE drivers SET user_id = NULL WHERE user_id = $userId` (driver record stays so historical loads/payroll keep working)
8. `DELETE FROM super_admin_audit_logs WHERE user_id = $userId`
9. `DELETE FROM super_admins WHERE user_id = $userId`
10. `DELETE FROM user_roles WHERE user_id = $userId` (already there)
11. `DELETE FROM profiles WHERE user_id = $userId` (already there)
12. `auth.admin.deleteUser(userId)` — finally remove from `auth.users`. The remaining `auth.identities/sessions/...` rows cascade automatically.

Also: add an audit-log entry attributing the deletion to `requestingUser.id` (with `action='user_deleted'`, target `userId`) so we keep a record after the row vanishes.

### 2. Fix the dangling FK so future deletions can't be blocked

New migration:
```sql
ALTER TABLE public.changelog
  DROP CONSTRAINT changelog_created_by_fkey,
  ADD CONSTRAINT changelog_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

### 3. Delete `ajb06.jrb07@gmail.com` now

After the function is redeployed, call it (or run the equivalent SQL + `auth.admin.deleteUser`) for user id `e089acf0-2a1b-498d-ad04-fa39b40d05e1`. If anything still blocks, capture the new Postgres error and add that table to the purge list.

## Out of scope

- No UI changes — the existing "Delete user" button keeps calling the same edge function.
- No changes to RLS or to the owner/super-admin authorization checks already in the function.
- Org-level data (loads, expenses, trucks, etc.) is **not** deleted — those belong to the organization, not the individual user. Only personal/auth records and dangling user references are removed.

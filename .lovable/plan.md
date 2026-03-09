

## Fix: "Delete My Account" Database Error

### Root Cause
The `delete-own-account` edge function fails with `Database error deleting user` because three tables have foreign key constraints referencing `auth.users` that are **not cleaned up** before attempting to delete the auth user:

- `load_status_logs.changed_by` → `auth.users(id)`
- `drivers.user_id` → `auth.users(id)`
- `documents.uploaded_by` → `auth.users(id)`

The function currently only deletes from `user_roles` and `profiles`, leaving these other references intact, which causes the auth deletion to fail.

### Solution
Two-part fix:

**1. Database Migration** — Change the foreign key constraints on these three columns to `ON DELETE SET NULL` so they don't block user deletion (preserving historical data with null references):

```sql
-- load_status_logs.changed_by
ALTER TABLE public.load_status_logs DROP CONSTRAINT IF EXISTS load_status_logs_changed_by_fkey;
ALTER TABLE public.load_status_logs ADD CONSTRAINT load_status_logs_changed_by_fkey 
  FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- drivers.user_id
ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_user_id_fkey;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- documents.uploaded_by
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_uploaded_by_fkey;
ALTER TABLE public.documents ADD CONSTRAINT documents_uploaded_by_fkey 
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

**2. Edge Function Update** — Also clean up the `organizations` table if the user is the sole owner (optional enhancement), and add explicit deletion for `drivers` and `documents` rows owned by this user before the auth delete, as a safety measure.

### Files to modify
| File | Change |
|------|--------|
| New migration SQL | Alter 3 FK constraints to `ON DELETE SET NULL` |
| `supabase/functions/delete-own-account/index.ts` | Add cleanup for `drivers`, `documents`, `load_status_logs` before auth deletion |


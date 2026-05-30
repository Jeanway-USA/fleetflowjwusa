# Fix Team tab showing users from other organizations

## Root cause

`src/components/settings/TeamManagementTab.tsx` runs:

- `supabase.from('profiles').select('*')`
- `supabase.from('user_roles').select('*')`

Neither query filters by `org_id`. RLS on `profiles`/`user_roles` correctly restricts owners to their own org — **but** the signed-in user (`andrew@jeanwayusa.com`) is also a `super_admin`. The `profiles_select_super_admin` / equivalent role policies return every row across every tenant, including orphan profiles with `org_id = null` (e.g. `wesmootiv@gmail.com`, `abc123@email.com`). That's why unrelated accounts appear in the JeanWay team list.

## Change

Scope the Team tab queries to the currently active org, regardless of super-admin privileges.

1. In `TeamManagementTab.tsx`, before fetching:
   - Read the current `org_id` from `AuthContext` (`profile.org_id`) — same source the rest of Settings uses.
   - If `org_id` is missing, render the existing empty state and skip the fetch.
2. Update both queries:
   - `supabase.from('profiles').select('*').eq('org_id', orgId)`
   - `supabase.from('user_roles').select('*').eq('org_id', orgId)`
3. Add `orgId` to the TanStack Query `queryKey` so cached data is per-org (matters when a super-admin switches into impersonation mode).
4. No RLS or backend changes — the policies are already correct; this is purely a client-side scoping fix.

## Out of scope

- Impersonation mode UI (already uses its own org context elsewhere).
- Cleaning up the orphan profiles with `org_id = null` — separate housekeeping task.
- Any change to `delete-user` edge function (just fixed).

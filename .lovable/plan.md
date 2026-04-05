

## Fix: Demo User Missing Profile Row

### Root Cause
The demo user (`fd457090-b1ca-4bdb-97b4-70e7ef8d98b4`) has **no row in the `profiles` table**. Every query from the client to `profiles` returns 0 rows (the 406 errors in network logs confirm this).

Both `demo-login` and `demo-switch-tier` edge functions use `.update()` on the profiles table to set `org_id`. But `UPDATE` on a non-existent row silently affects 0 rows. So the org linkage is never established, and the client-side `AuthContext.fetchOrgData()` always fails, defaulting the tier to `solo_bco` regardless of what the edge function updated on the `organizations` table.

### Fix

**1. `supabase/functions/demo-login/index.ts`** — Use upsert instead of update for profiles
- Replace all `.update({ org_id: ... }).eq('user_id', userId)` calls with `.upsert({ user_id, org_id, email: DEMO_EMAIL, first_name: 'Demo', last_name: 'User' }, { onConflict: 'user_id' })`.
- This ensures the profile row is created if missing, or updated if it exists.
- Apply this fix in all three code paths (successful sign-in repair, password-reset repair, and new-user setup).

**2. `supabase/functions/demo-switch-tier/index.ts`** — Same upsert fix
- Replace the `.update({ org_id }).eq('user_id', user.id)` with `.upsert(...)` so tier switching also self-heals a missing profile.

### Files
| File | Change |
|------|--------|
| `supabase/functions/demo-login/index.ts` | Change 3 profile `.update()` calls to `.upsert()` with `onConflict: 'user_id'` |
| `supabase/functions/demo-switch-tier/index.ts` | Change profile `.update()` to `.upsert()` with `onConflict: 'user_id'` |


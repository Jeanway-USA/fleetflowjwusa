

## Restore andrew@jeanwayusa.com Account

### Current State
- **Auth user exists** (ID: `1513f113-4f68-4628-95bf-581ba5dabbe0`) — not actually deleted from auth
- **Profile row is missing** — was deleted during a self-delete attempt or got lost
- **user_roles row exists** but points to orphan org `0fcafc19-...` ("My Trucking Company", inactive) instead of JeanWay USA (`a0000000-0000-0000-0000-000000000001`)
- An orphan organization "My Trucking Company" was created during a failed onboarding attempt

### Fix (3 data operations)

1. **Recreate the profile** linking andrew to JeanWay USA org
2. **Update user_roles** to point to the correct JeanWay USA org
3. **Delete the orphan org** "My Trucking Company"

All three are data updates — no schema or code changes needed.


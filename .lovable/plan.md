Plan:

1. **Fix the active organization source**
   - Update the auth/tenant context so when a super-admin starts or stops viewing another organization, the in-memory `orgId` and organization metadata refresh immediately instead of relying on the previous organization until a full reload.

2. **Harden the W-2 driver sync query**
   - In the W-2 Driver Sync dashboard, use the effective active organization for the query key and `.eq('org_id', activeOrgId)` filter.
   - Keep the query disabled until the active organization is known, so stale data cannot render between tenant changes.

3. **Invalidate stale driver cache on org changes**
   - Ensure W-2 driver sync/onboarding queries are invalidated when switching organizations so cached JeanWay rows cannot appear while viewing another organization.

4. **Verify the backend guard**
   - Confirm the driver table access rules still require `drivers.org_id` to match the authenticated user’s active organization.
   - If the UI fix is not enough, add a restrictive organization-match policy so every driver read must match the current active organization, regardless of other permissive role policies.

Technical notes:
- The prior component filter was added, but the app can still hold a stale `orgId` after organization simulation because the context only updates `simulatedOrgId` from local storage and does not refresh tenant data.
- Andrew currently exists in the JeanWay organization in the database, so if you are viewing a different organization, this is most likely a stale active-org/client-cache issue rather than the W-2 filter itself.
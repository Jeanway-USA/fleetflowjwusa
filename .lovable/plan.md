
Fix the demo switcher by moving tier changes out of the client-side table update flow and into a dedicated backend function, then add the missing All-in-One option.

1. Root cause
- The current Demo Controls rely on a direct client update to `organizations.subscription_tier`.
- That path is brittle for demo mode because it depends on the demo user’s org/owner linkage and RLS being perfectly aligned at the time of the click.
- Even when the tier system itself supports `all_in_one`, the Demo Controls panel only exposes 3 buttons.
- The existing routing/tier-gating code already supports `all_in_one`, so the missing piece is a reliable switch mechanism plus the new button.

2. What to build
- Add a new backend function, `demo-switch-tier`, that:
  - verifies the caller is the demo account
  - repairs/ensures `profiles.org_id` and the demo user’s `owner` role point to the same org
  - updates the org’s `subscription_tier` with admin privileges
  - returns the normalized tier and the correct landing route
- Update `src/components/demo/DemoControls.tsx` to:
  - add an `All-in-One` button
  - call the new backend function instead of updating `organizations` directly
  - refresh org data after success
  - force a deterministic route change so users always see a visible change immediately

3. Files to update
- `src/components/demo/DemoControls.tsx`
  - extend the tier list to include `all_in_one`
  - replace direct `.from('organizations').update(...)` with `supabase.functions.invoke('demo-switch-tier', { body: { tier } })`
  - use the returned `landingPath` and force navigation with a hard route change if needed so the page visibly updates every time
  - surface backend error messages in the toast instead of a generic silent failure
- `supabase/functions/demo-switch-tier/index.ts` (new)
  - follow the same demo-account repair pattern already used in `demo-login`
  - use an admin client for the org update
  - map tiers to routes:
    - `solo_bco` → `/fleet-loads`
    - `fleet_owner` → `/executive-dashboard`
    - `agency` → `/agency-loads`
    - `all_in_one` → `/executive-dashboard`
- `supabase/functions/demo-login/index.ts`
  - optionally extract/reuse the same “ensure demo org + owner linkage” logic so both functions stay consistent
  - keep demo login defaulting to `all_in_one`

4. Technical details
- No database migration is needed.
- `all_in_one` is already supported in:
  - `AuthContext` type
  - `useSubscriptionTier`
  - `RoleBasedRedirect`
  - sidebar feature maps
- The safest fix is to stop depending on client-side RLS for demo tier switching and make the backend return the authoritative result.
- The redirect should be explicit and forceful enough that users always see a route/page change after clicking a tier.

5. Expected result
- Solo BCO button visibly routes to the Solo experience.
- Fleet Owner button visibly routes to the executive view.
- Agency button visibly routes to the agency loads view.
- All-in-One button unlocks all plan-gated features and routes to the executive dashboard.
- Users no longer need a manual refresh to see the tier change take effect.

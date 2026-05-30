# Scope link-to-user dropdown to current org

## Problem

On `/drivers`, the New/Edit Driver dialog's "Link to User Account" select lists profiles from every organization (demo, marvetos, etc.). It should only show users in the current org.

## Change

In `src/pages/Drivers.tsx`:

1. Pull `orgId` from `useAuth()` (already imported).
2. Update the `profiles-for-linking` query to:
   - Include `orgId` in the queryKey
   - Add `.eq('org_id', orgId)` to the Supabase select
   - Gate with `enabled: !!orgId`

That's the only change. No DB, RLS, or UI shape changes.

## Verification

Open the New Driver dialog as a JeanWay USA owner. The User Account dropdown should only contain JeanWay USA profiles (e.g. `andrew@jeanwayusa.com`, `hr@jeanwayusa.com`, `siadrak@jeanwayusa.com`) plus "No linked user" — no demo or marvetos entries.

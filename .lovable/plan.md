

# Optimization, Bug Testing, and Feature Testing Fixes

## Bugs Found

### 1. React Ref Warning on DriverDashboard
The console shows "Function components cannot be given refs" for `DriverDashboard`. This happens because React Router internally tries to attach a ref to the route element. The component uses `export default function` without `forwardRef`, causing the warning on every render.

**Fix**: Wrap `DriverDashboard` (and other default-exported page components that show this warning) with `React.forwardRef`.

### 2. Truck Query Uses `.single()` Instead of `.maybeSingle()`
In `DriverDashboard.tsx` line 61, the truck lookup query uses `.single()`. When a driver has no assigned truck, this triggers a PostgREST error (suppressed by the `PGRST116` check, but still noisy). Should use `.maybeSingle()` for consistency with the pattern established for the driver query.

### 3. TierGate Doesn't React to Demo Tier Switches
This is a functional bug affecting the demo experience. When a demo user switches tiers via `DemoControls`, the `AuthContext.subscriptionTier` updates correctly (sidebar re-renders). However, `TierGate` uses `useSubscriptionTier()` which has its own **independent** `useState`/`useEffect` that fetches org data separately. It never re-fetches after `refreshOrgData()` runs, so pages gated by `TierGate` (via `ProtectedRoute`) won't show/hide correctly until a full page reload.

**Fix**: Refactor `useSubscriptionTier` to read the tier from `AuthContext` (which already has `subscriptionTier` and `orgId`) instead of doing its own duplicate database fetch. This eliminates the stale-data bug and removes redundant network requests on every page load.

### 4. Duplicate Org Data Fetching
Both `AuthContext` and `useSubscriptionTier` independently query `profiles` and `organizations` tables to get the same subscription tier data. Every page that uses `TierGate` fires 2 extra queries that are already handled by `AuthContext`. Consolidating saves ~2 network requests per protected page load.

### 5. Missing DialogDescription Accessibility Warnings
Multiple dialogs across the app use `DialogContent` without a `DialogDescription`, causing console warnings. The most impactful ones are in frequently-used pages.

---

## Changes

### File: `src/hooks/useSubscriptionTier.ts` -- Refactor
Remove the independent database fetch. Instead, read `subscriptionTier` and `orgId` directly from `AuthContext`. Keep the `TIER_FEATURES` map and `hasFeature()` logic, but derive everything from the already-fetched context values. This fixes both bug 3 (stale tier after demo switch) and bug 4 (duplicate fetching).

### File: `src/pages/DriverDashboard.tsx` -- Two fixes
1. Change the truck query on line 61 from `.single()` to `.maybeSingle()` and remove the manual `PGRST116` error check.
2. Wrap the component with `React.forwardRef` to fix the ref warning.

### File: `src/components/ui/dialog.tsx` -- Add default DialogDescription
Add a `VisuallyHidden` description fallback within `DialogContent` so dialogs that don't explicitly provide a `DialogDescription` won't trigger accessibility warnings. This is a one-time fix that covers all dialogs app-wide.

---

## Technical Details

### useSubscriptionTier Refactor

Before (fetches from DB independently):
```typescript
export function useSubscriptionTier() {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  useEffect(() => { /* fetch profiles, then organizations */ }, [user]);
  // ...
}
```

After (reads from AuthContext):
```typescript
export function useSubscriptionTier() {
  const { subscriptionTier, orgId, loading } = useAuth();
  const tier = subscriptionTier;
  const features = TIER_FEATURES[tier] ?? TIER_FEATURES.solo_bco;
  const hasFeature = (feature: string) => features.includes(feature);
  return { tier, features, hasFeature, loading };
}
```

### DriverDashboard forwardRef

```typescript
const DriverDashboard = React.forwardRef<HTMLDivElement>(function DriverDashboard(_, ref) {
  // existing component body
});
export default DriverDashboard;
```

### Truck query fix

```typescript
// Line 61: change .single() to .maybeSingle()
const { data, error } = await supabase
  .from('trucks')
  .select('*')
  .eq('current_driver_id', driver?.id)
  .maybeSingle();
if (error) throw error;
return data;
```

## Files Summary

| File | Change |
|------|--------|
| `src/hooks/useSubscriptionTier.ts` | Refactor to read from AuthContext instead of duplicate DB fetch |
| `src/pages/DriverDashboard.tsx` | Fix `.single()` to `.maybeSingle()`, add `forwardRef` |
| `src/components/ui/dialog.tsx` | Add VisuallyHidden description fallback for accessibility |



# Implement Tier + Role Combined Access Control

## What This Solves

Right now, the sidebar hides links based on tier and role -- but if someone types a URL directly (e.g., `/drivers` or `/finance`), nothing stops them. A Dispatcher in a Solo BCO org can visit `/drivers` manually. A Driver can visit `/finance`. This plan adds page-level enforcement so both tier AND role are checked before any page renders.

## Changes Overview

### 1. Create a `ProtectedRoute` wrapper component

A new reusable component that wraps every dashboard route. It checks:
- Is the user authenticated? (redirect to `/auth` if not)
- Does the user have the required role? (redirect to `/` or show "Access Denied" if not)
- Does the org's tier include the required feature? (show `TierGate` upgrade prompt if not)

This replaces the auth check currently inside `DashboardLayout`.

### 2. Update App.tsx routes with access rules

Every route gets explicit role and feature requirements:

| Route | Allowed Roles | Required Feature |
|-------|--------------|-----------------|
| `/executive-dashboard` | owner | executive_dashboard |
| `/dispatcher-dashboard` | owner, dispatcher | dispatch |
| `/driver-dashboard` | owner, driver | (none -- always allowed) |
| `/trucks` | owner, dispatcher, safety | trucks |
| `/trailers` | owner, dispatcher, safety | trailers |
| `/drivers` | owner, payroll_admin, dispatcher, safety | drivers |
| `/fleet-loads` | owner, dispatcher, safety, driver | loads |
| `/agency-loads` | owner, dispatcher | agency_loads |
| `/finance` | owner, payroll_admin | profit_loss |
| `/insights` | owner, payroll_admin | insights |
| `/ifta` | owner, payroll_admin | ifta |
| `/crm` | owner, dispatcher, safety, driver | crm |
| `/maintenance` | owner, safety | maintenance_full |
| `/documents` | owner, payroll_admin, dispatcher, safety, driver | documents |
| `/safety` | owner, safety | safety |
| `/incidents` | owner, safety, dispatcher | incidents |
| `/driver-performance` | owner, safety, dispatcher | driver_performance |
| `/settings` | owner | (none -- always allowed) |
| `/driver-settings` | driver | (none -- always allowed) |
| `/driver-stats` | driver | (none -- always allowed) |

### 3. Update RoleBasedRedirect to route by tier

Currently it only checks role. Updated logic:

- **Solo BCO owner**: redirect to `/fleet-loads` (personal load view -- no executive dashboard in this tier)
- **Fleet Owner owner**: redirect to `/executive-dashboard`
- **Agency owner**: redirect to `/agency-loads`
- **All-in-One owner**: redirect to `/executive-dashboard`
- **Dispatcher**: redirect to `/dispatcher-dashboard`
- **Driver**: redirect to `/driver-dashboard`

### 4. Hide billing/subscription info from non-owners

The Settings page and any subscription-related UI should only render for users with the `owner` role. Dispatchers in any tier should not see billing information. This is already partially done (Settings is owner-only in sidebar) but needs enforcement at the page level.

## Technical Details

### New file: `src/components/shared/ProtectedRoute.tsx`

```typescript
interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  requiredFeature?: string;
}
```

This component:
1. Shows a loading spinner while auth/roles resolve
2. Redirects to `/auth` if not authenticated
3. Redirects to `/` if the user's role doesn't match `allowedRoles`
4. Wraps children in `TierGate` if `requiredFeature` is specified
5. Wraps children in `DashboardLayout`

### Modified file: `src/App.tsx`

Routes change from:
```tsx
<Route path="/trucks" element={<Trucks />} />
```
To:
```tsx
<Route path="/trucks" element={
  <ProtectedRoute allowedRoles={['owner','dispatcher','safety']} requiredFeature="trucks">
    <Trucks />
  </ProtectedRoute>
} />
```

### Modified file: `src/components/shared/RoleBasedRedirect.tsx`

Add tier-aware routing logic using `subscriptionTier` from AuthContext.

### Modified file: `src/components/layout/DashboardLayout.tsx`

Remove the auth check (loading spinner + redirect to `/auth`) since `ProtectedRoute` now handles this. `DashboardLayout` becomes a pure layout wrapper.

## Files Summary

| File | Action |
|------|--------|
| `src/components/shared/ProtectedRoute.tsx` | Create |
| `src/App.tsx` | Modify -- wrap all routes |
| `src/components/shared/RoleBasedRedirect.tsx` | Modify -- add tier logic |
| `src/components/layout/DashboardLayout.tsx` | Modify -- remove auth guard |

No database changes needed. All enforcement is additive UI-layer logic on top of the existing RLS policies (which already enforce isolation server-side).


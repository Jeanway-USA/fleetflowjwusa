

# Live Demo Experience with Tier Switcher

## Overview

The demo login infrastructure already exists -- a `demo-login` edge function creates a demo org with `all_in_one` tier and seeds sample data. This plan enhances the experience with a floating tier switcher, read-only safeguards, and a persistent signup CTA.

## Changes

### 1. Demo Tier Switcher (Floating Panel)

Create a new `DemoControls` component that renders a floating panel in the bottom-right corner, visible only when the logged-in user is `demo@fleetflow-tms.com`.

The panel will contain:
- Three buttons: "Solo BCO", "Fleet Owner", "Agency"
- The active tier is highlighted
- Clicking a tier updates the `subscription_tier` on the demo org via a direct Supabase update, then reloads the AuthContext state so the sidebar and TierGate components immediately reflect the new tier

This works because the demo user is an `owner` with `all_in_one` tier. When the user clicks "Solo BCO", the component updates the org's `subscription_tier` to `solo_bco` in the database. The sidebar (which reads tier from AuthContext) will re-filter navigation items, and any pages gated by `TierGate` will show the upgrade prompt. Switching back to "Fleet Owner" or "Agency" works the same way.

**File**: `src/components/demo/DemoControls.tsx` (new)

### 2. Seed Agency Sample Data

Update the `demo-login` edge function to also insert:
- Sample `crm_contacts` (shipper, carrier, agent records)
- Sample `agency_loads` (brokered loads with commission data)
- Sample `agent_commissions`

This ensures the Agency tier view has data to display.

**File**: `supabase/functions/demo-login/index.ts` (modify)

### 3. Read-Only Restrictions in Demo Mode

Create a `useDemoMode` hook that checks if the current user email is `demo@fleetflow-tms.com`. Components will use this to:
- Disable delete buttons (show toast "Disabled in demo mode")
- Disable Settings page edits (redirect or show message)
- Disable any destructive mutations

Rather than modifying every individual component, we will:
- Add a `isDemoMode` boolean to `AuthContext` (derived from `user?.email`)
- Update `DashboardLayout` to pass demo state down
- Add a global `useDemoGuard()` helper that components can call before mutations -- returns `true` if blocked, showing a toast
- Specifically disable the Settings nav link and delete confirmations

**Files**: 
- `src/hooks/useDemoGuard.ts` (new)
- `src/contexts/AuthContext.tsx` (add `isDemoMode` field)
- `src/components/shared/ConfirmDeleteDialog.tsx` (check demo mode)
- `src/pages/Settings.tsx` (show read-only banner)

### 4. Persistent CTA Banner

Enhance the existing demo banner in `DashboardLayout.tsx`:
- Make it sticky at the top (already is)
- Add the tier switcher inline on desktop, or keep it in the floating panel on mobile
- Update the "Sign Up for Real" button styling to be more prominent (gradient-gold)

**File**: `src/components/layout/DashboardLayout.tsx` (modify)

### 5. Refresh AuthContext Tier on Demo Switch

Add a `refreshOrgData()` method to `AuthContext` that re-fetches the org's subscription tier. The `DemoControls` component will call this after updating the tier in the database, so the entire app re-renders with the new tier's navigation and feature gates.

**File**: `src/contexts/AuthContext.tsx` (add `refreshOrgData`)

## Technical Details

### DemoControls Component (new)
```text
+----------------------------------+
|  Demo Controls                   |
|  [Solo BCO] [Fleet] [Agency]     |
|  "Like what you see?"            |
|  [Start Your Beta Account ->]    |
+----------------------------------+
```
- Positioned `fixed bottom-6 right-6 z-50`
- Only renders when `isDemoMode` is true
- Updates `organizations.subscription_tier` via Supabase client (the demo user is an owner, so RLS allows this)
- Calls `refreshOrgData()` from AuthContext after update

### useDemoGuard Hook (new)
```typescript
export function useDemoGuard() {
  const { isDemoMode } = useAuth();
  
  const guard = (action?: string) => {
    if (isDemoMode) {
      toast.info(
        action 
          ? `${action} is disabled in demo mode` 
          : 'This action is disabled in demo mode'
      );
      return true; // blocked
    }
    return false; // allowed
  };
  
  return { isDemoMode, guard };
}
```

### AuthContext Changes
- Add `isDemoMode: boolean` (derived: `user?.email === 'demo@fleetflow-tms.com'`)
- Add `refreshOrgData: () => Promise<void>` method that re-reads org data
- Expose both in context value

### Edge Function Seed Data Additions
Add after existing expense seeding:
- 3 CRM contacts (shipper, carrier, agent)
- 3 agency loads with commission data
- This ensures the Agency view has content

## File Summary

| File | Action |
|------|--------|
| `src/components/demo/DemoControls.tsx` | Create |
| `src/hooks/useDemoGuard.ts` | Create |
| `src/contexts/AuthContext.tsx` | Modify (add isDemoMode, refreshOrgData) |
| `src/components/layout/DashboardLayout.tsx` | Modify (render DemoControls, enhance banner) |
| `src/components/shared/ConfirmDeleteDialog.tsx` | Modify (block deletes in demo) |
| `src/pages/Settings.tsx` | Modify (read-only banner in demo) |
| `supabase/functions/demo-login/index.ts` | Modify (seed agency data) |

No database migrations needed. The demo user already has owner access and can update their own org's tier via existing RLS policies.


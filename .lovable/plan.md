

## Plan: Open Beta Auto-Activation + Beta Member Badge

### Problem
New users signing up during the open beta should automatically get `subscription_status = 'active'` and `subscription_tier = 'open_beta'` without hitting any payment screens. They also need a visible "Beta Member" badge in the dashboard header.

### Changes

#### 1. Database Migration — Add `open_beta` tier support and auto-set status

Update the `create_onboarding_org` function to set `subscription_status = 'active'` on the newly created org (currently defaults to `'trialing'`). Change the default tier parameter to `'open_beta'`.

```sql
CREATE OR REPLACE FUNCTION public.create_onboarding_org(_name text, _tier text DEFAULT 'open_beta')
  RETURNS uuid ...
AS $$
  ...
  INSERT INTO public.organizations (name, subscription_tier, subscription_status)
  VALUES (_name, _tier, 'active')
  RETURNING id INTO _org_id;
  ...
$$;
```

#### 2. `src/hooks/useSubscriptionTier.ts` — Add `open_beta` tier

Add `open_beta` to the `SubscriptionTier` type union and `TIER_FEATURES` map. Give it the same features as `solo_bco` (or all features, since it's beta — will match solo_bco for now).

#### 3. `src/contexts/AuthContext.tsx` — Add `open_beta` to `SubscriptionTier` type

Update the type: `'solo_bco' | 'fleet_owner' | 'agency' | 'all_in_one' | 'open_beta'`

#### 4. `src/pages/Onboarding.tsx` — Remove plan selection, pass no tier (uses new default)

The onboarding call already doesn't pass `_tier`, so it will use the new default `'open_beta'`. No change needed here unless there's a plan selection step — the current 3 steps are Org → Fleet → Invite, so no payment gate exists. No changes needed.

#### 5. `src/components/layout/DashboardLayout.tsx` — Add Beta Member badge

In the dashboard header (line ~175-197), add a "Beta Member" badge next to the breadcrumb when the user's `subscriptionTier === 'open_beta'`. Style it with a gold gradient and sparkle icon.

```tsx
import { Sparkles } from 'lucide-react';
import { useSubscriptionTier } from '@/hooks/useSubscriptionTier';

// In header, after breadcrumb:
{tier === 'open_beta' && (
  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/15 to-yellow-500/15 border border-amber-500/30">
    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Beta Member</span>
  </div>
)}
```

#### 6. `src/pages/Pricing.tsx` — Skip checkout for open_beta users

If user's current tier is `open_beta`, show messaging that they already have full access during beta instead of showing checkout buttons.

### Files to edit
- **Migration**: Update `create_onboarding_org` function (set `subscription_status = 'active'`, default tier to `'open_beta'`)
- `src/contexts/AuthContext.tsx` — Add `'open_beta'` to `SubscriptionTier` type
- `src/hooks/useSubscriptionTier.ts` — Add `open_beta` tier features
- `src/components/layout/DashboardLayout.tsx` — Add Beta Member badge in header
- `src/pages/Pricing.tsx` — Show "You have beta access" instead of checkout buttons


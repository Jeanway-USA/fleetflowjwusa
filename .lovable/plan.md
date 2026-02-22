
## Super Admin Panel Enhancements

### 1. Add Super Admin Button to Sidebar

Add a "Super Admin" link in `AppSidebar.tsx` visible only to the two authorized emails. This will appear as a separate section at the bottom of the sidebar content, above the footer, with a distinctive icon (ShieldCheck).

**File: `src/components/layout/AppSidebar.tsx`**
- Import `ShieldCheck` from lucide-react
- After the Admin/Settings section and before the Driver "My Account" section, add a conditional block that checks `user?.email` against the super admin list
- Renders a "Super Admin" nav link to `/super-admin`

### 2. Organization Detail Sheet

Create a new component `src/components/superadmin/OrgDetailSheet.tsx` that opens as a slide-out Sheet when clicking an org row in the Organizations table.

**Content displayed:**
- Org name, subscription tier (with badge), created date
- Trial end date (from `trial_ends_at` column)
- Active status (`is_active`)
- User count
- Branding info (primary color, logo URL, banner URL)
- A "Deactivate Organization" button that sets `is_active = false` on the organizations table (via a SECURITY DEFINER function to bypass RLS)
- A "Change Tier" dropdown to update `subscription_tier`

### 3. Database Migration

**New SECURITY DEFINER view `super_admin_org_detail`** -- extends the organizations view to include `trial_ends_at`, `is_active`, `primary_color`, `logo_url`, `banner_url`.

Or simpler: update the existing `super_admin_organizations` view to include these extra columns.

**New SECURITY DEFINER function `super_admin_update_org`** -- allows super admins to update org fields (subscription_tier, is_active) bypassing RLS:
```sql
CREATE OR REPLACE FUNCTION public.super_admin_update_org(
  target_org_id uuid,
  new_tier text DEFAULT NULL,
  new_is_active boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE organizations
  SET
    subscription_tier = COALESCE(new_tier, subscription_tier),
    is_active = COALESCE(new_is_active, is_active),
    updated_at = now()
  WHERE id = target_org_id;
END;
$$;
```

### 4. Simulate Button Functionality

Make the "Simulate" button navigate to the executive dashboard while overriding the org context. Since the existing role simulation only swaps roles within the same org, org-level simulation requires a different approach.

Implementation: Store a `simulatedOrgId` in localStorage, and create a banner in `DashboardLayout` that shows when simulating. The `AuthContext` will read this override to swap `orgId`/`orgName`/`subscriptionTier` when a super admin is simulating. An "Exit Simulation" button clears it and returns to `/super-admin`.

**Files modified:**
- `src/contexts/AuthContext.tsx` -- add `simulatedOrgId` state, read from localStorage, override org data when set
- `src/components/layout/DashboardLayout.tsx` -- show simulation banner when `simulatedOrgId` is active
- `src/pages/SuperAdminDashboard.tsx` -- wire up Simulate button to set localStorage + navigate

### 5. Summary of All Changes

| File | Action |
|------|--------|
| `supabase/migrations/...` | Update `super_admin_organizations` view + add `super_admin_update_org` function |
| `src/components/layout/AppSidebar.tsx` | Add Super Admin nav link for authorized emails |
| `src/components/superadmin/OrgDetailSheet.tsx` | New -- org detail slide-out with tier change + deactivate |
| `src/pages/SuperAdminDashboard.tsx` | Add org click handler, wire Simulate button |
| `src/contexts/AuthContext.tsx` | Add `simulatedOrgId` support for org-level simulation |
| `src/components/layout/DashboardLayout.tsx` | Show org simulation banner |

### Technical Details

**Database migration SQL:**
```sql
-- Update organizations view to include more fields
CREATE OR REPLACE VIEW public.super_admin_organizations
WITH (security_invoker = false)
AS
SELECT
  o.id, o.name, o.subscription_tier, o.created_at,
  o.trial_ends_at, o.is_active, o.primary_color, o.logo_url, o.banner_url,
  (SELECT count(*) FROM public.profiles p WHERE p.org_id = o.id)::int AS user_count
FROM public.organizations o
WHERE public.is_super_admin();

-- RPC to update org (bypasses RLS)
CREATE OR REPLACE FUNCTION public.super_admin_update_org(
  target_org_id uuid,
  new_tier text DEFAULT NULL,
  new_is_active boolean DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE organizations SET
    subscription_tier = COALESCE(new_tier, subscription_tier),
    is_active = COALESCE(new_is_active, is_active),
    updated_at = now()
  WHERE id = target_org_id;
END; $$;
```

**Sidebar super admin check:** Check `user?.email` against `['andrew@jeanwayusa.com', 'siadrak@jeanwayusa.com']` -- same list used in `SuperAdminGuard`.

**Org simulation flow:**
1. Click "Simulate" on an org row
2. Store `simulatedOrgId` in localStorage + AuthContext state
3. AuthContext fetches that org's data and overrides `orgId`, `orgName`, `subscriptionTier`
4. Navigate to `/executive-dashboard`
5. A gold banner shows "Simulating: [Org Name]" with an "Exit" button
6. Exit clears localStorage + state, navigates back to `/super-admin`

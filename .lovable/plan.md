

## Plan: Add Global Beta Lifecycle Card to Super Admin Dashboard

### Overview
Add a "Global Beta Lifecycle" card to the Overview tab of the Super Admin Dashboard with two action buttons (End Beta / Resume Beta) and a strict confirmation dialog for the destructive action.

### Changes

#### 1. New Component: `src/components/superadmin/BetaLifecycleCard.tsx`

A card containing:
- Title: "Global Beta Lifecycle"
- Description text explaining the current beta state
- **"End Open Beta Phase"** button — red/destructive styling. On click, opens an `AlertDialog` with:
  - Warning message: "This will instantly deactivate all organizations currently on the Open Beta tier. Are you sure?"
  - Type-to-confirm input (type `END BETA`)
  - Destructive confirm action
- **"Resume Open Beta"** button — green/success styling. Simpler confirmation dialog.
- Both buttons call a new database RPC

#### 2. Database Migration — `super_admin_end_beta` and `super_admin_resume_beta` RPCs

Two security-definer functions gated by `is_super_admin()`:

```sql
-- End beta: deactivate all open_beta orgs
CREATE FUNCTION public.super_admin_end_beta() RETURNS integer
  UPDATE organizations SET is_active = false, subscription_status = 'expired', updated_at = now()
  WHERE subscription_tier = 'open_beta' AND is_active = true;
  -- Returns count of affected rows

-- Resume beta: reactivate all open_beta orgs  
CREATE FUNCTION public.super_admin_resume_beta() RETURNS integer
  UPDATE organizations SET is_active = true, subscription_status = 'active', updated_at = now()
  WHERE subscription_tier = 'open_beta' AND is_active = false;
```

#### 3. `src/pages/SuperAdminDashboard.tsx` — Add card to Overview tab

Import `BetaLifecycleCard` and place it after the Tier Distribution card in the Overview tab content.

### Files
- **New**: `src/components/superadmin/BetaLifecycleCard.tsx`
- **Migration**: Two new RPCs (`super_admin_end_beta`, `super_admin_resume_beta`)
- **Edit**: `src/pages/SuperAdminDashboard.tsx` — import and render the new card


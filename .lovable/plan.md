

# Add SaaS Layer: Multi-Tenant TMS with Subscription Tiers

## Overview

Add a public-facing SaaS layer on top of the existing JeanWay TMS. The current functionality stays intact as-is. New concepts introduced: **Organizations** (multi-tenancy), **Subscription Tiers** (feature gating), and a **Public Landing/Pricing Page**. Existing roles (owner, dispatcher, driver, etc.) continue to work within each organization.

## Architecture

The core idea: every data table gets an `org_id` column. Each user belongs to one organization. The organization has a subscription tier that controls which features are visible. Roles within the org control permissions.

```text
+------------------+     +------------------+     +------------------+
|   organizations  |     |     profiles      |     |    user_roles    |
|------------------|     |------------------|     |------------------|
| id (PK)          |<----| org_id (FK)       |     | user_id          |
| name             |     | user_id           |---->| role (app_role)  |
| subscription_tier|     | first_name        |     +------------------+
| trial_ends_at    |     | ...               |
| stripe_customer  |     +------------------+
+------------------+
        |
        | org_id FK on all data tables
        v
  fleet_loads, trucks, drivers, expenses, ...
```

## Phase 1: Database Changes (Migration)

### 1A. Create `organizations` table

```sql
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subscription_tier text NOT NULL DEFAULT 'solo_bco',
  trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
```

### 1B. Add `org_id` to `profiles` table

```sql
ALTER TABLE public.profiles ADD COLUMN org_id uuid REFERENCES public.organizations(id);
```

### 1C. Add `org_id` to all data tables

Add `org_id uuid REFERENCES public.organizations(id)` to these tables:
- fleet_loads, trucks, trailers, drivers, expenses
- agency_loads, agent_commissions, settlements, driver_payroll
- crm_contacts, crm_contact_loads, crm_activities
- documents, incidents, work_orders, maintenance_requests
- driver_inspections, driver_notifications, driver_requests
- general_ledger, company_resources, company_settings

### 1D. Create helper function

```sql
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;
```

### 1E. Update RLS policies

All existing RLS policies need an additional `org_id = get_user_org_id(auth.uid())` condition so users only see data belonging to their organization. This is the most labor-intensive part.

### 1F. Create a default organization for existing data

```sql
-- Create org for JeanWay (existing data)
INSERT INTO organizations (id, name, subscription_tier)
VALUES ('...generated-uuid...', 'JeanWay USA', 'all_in_one');

-- Backfill org_id on all existing rows
UPDATE profiles SET org_id = '...uuid...' WHERE org_id IS NULL;
UPDATE fleet_loads SET org_id = '...uuid...' WHERE org_id IS NULL;
-- ... repeat for all tables
```

## Phase 2: Subscription Tier Feature Gating

### 2A. Create `useSubscriptionTier` hook

A React hook that reads the current user's organization tier and exposes feature flags:

```typescript
// src/hooks/useSubscriptionTier.ts
const TIER_FEATURES = {
  solo_bco: ['loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss'],
  fleet_owner: ['...solo_bco', 'drivers', 'dispatch', 'settlements', 'fleet_analytics', 'gps_tracking'],
  agency: ['agency_loads', 'carrier_vetting', 'commissions', 'crm', 'load_board'],
  all_in_one: ['...all features'],
};
```

### 2B. Gate sidebar navigation

Modify `AppSidebar.tsx` to filter nav items based on both role AND subscription tier. Items not included in the tier are hidden entirely (not just disabled).

### 2C. Gate page access

Add a `<TierGate requiredFeature="dispatch">` wrapper component that shows an upgrade prompt if the feature isn't available in the user's tier.

## Phase 3: Public Pages

### 3A. Landing Page (`/` for unauthenticated users)

- Hero section with value proposition for Landstar BCOs
- Feature highlights by tier
- "Start 14-Day Beta Trial" CTA
- "Try Demo" button

### 3B. Pricing Page (`/pricing`)

- Three cards: Solo BCO, Fleet Owner, Agency
- "All-in-One" toggle that shows a fourth combined card
- Feature comparison table
- "Start 14-Day Beta Trial" button on each card

### 3C. Signup flow update

- Modify `Auth.tsx` signup to include tier selection
- On signup, auto-create an `organizations` row with the selected tier
- Set `trial_ends_at` to 14 days from signup

## Phase 4: Demo Mode

### 4A. Create demo organization

Seed a read-only organization with sample Landstar load data (pre-populated trucks, loads, drivers, expenses).

### 4B. Demo login

- "Try Demo" button on landing page
- Logs user into a shared demo account (or creates an ephemeral guest session)
- Demo data is read-only (enforced via RLS or UI-level restrictions)
- Banner at top: "You're in Demo Mode -- Sign up to start your own workspace"

## Phase 5: Updated Routing

### 5A. New routes

```text
/              -- Landing page (unauthenticated) or RoleBasedRedirect (authenticated)
/pricing       -- Pricing page (public)
/auth          -- Updated with tier selection on signup
/dashboard     -- Dynamic dashboard based on tier + role
```

### 5B. RoleBasedRedirect updates

- Solo BCO -> `/dashboard` (personal load/profit view)
- Fleet Owner -> `/executive-dashboard`
- Agency -> `/agency-dashboard` (new)
- All-in-One -> `/executive-dashboard`

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/Landing.tsx` | Public landing page |
| `src/pages/Pricing.tsx` | Pricing comparison page |
| `src/hooks/useSubscriptionTier.ts` | Tier detection + feature flags |
| `src/components/shared/TierGate.tsx` | Feature gating wrapper |
| `src/pages/SoloBCODashboard.tsx` | Solo owner dashboard |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add Landing, Pricing routes; update `/` logic |
| `src/pages/Auth.tsx` | Add tier selection to signup |
| `src/components/layout/AppSidebar.tsx` | Filter nav by tier + role |
| `src/components/shared/RoleBasedRedirect.tsx` | Route by tier |
| `src/contexts/AuthContext.tsx` | Include org_id and tier in context |

## Implementation Order

Due to the scope, this should be built in phases:

1. **Phase 1** (Database) -- Organizations table, org_id columns, RLS updates, backfill existing data
2. **Phase 2** (Feature Gating) -- useSubscriptionTier hook, sidebar gating, TierGate component
3. **Phase 3** (Public Pages) -- Landing page, Pricing page, updated signup
4. **Phase 4** (Demo Mode) -- Seed data, demo login flow
5. **Phase 5** (Routing) -- New dashboards, updated redirects

**Recommendation**: Start with Phase 1 + 3 (database + landing/pricing pages) as they're independent. Phase 2 and 5 depend on Phase 1. Phase 4 can be done last.

This is a multi-session effort. Approve to begin with Phase 1 (database setup) and Phase 3 (landing + pricing pages).


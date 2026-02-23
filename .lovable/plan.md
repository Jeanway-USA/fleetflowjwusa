

## Billing and Promotions Tab for Super Admin Panel

Add a comprehensive "Billing and Promotions" tab to the Super Admin Dashboard that enables dynamic SaaS pricing control, promo code management, and site-wide sales configuration.

### Overview

This feature adds three core capabilities to the admin panel:
- **Plan Pricing Management** -- Edit monthly/annual prices for each subscription tier
- **Promo Code Engine** -- Create, manage, and track discount codes
- **Global Event Sales** -- Toggle site-wide promotions that apply automatically

A KPI row at the top provides estimated MRR, active promo count, and total redemptions at a glance.

---

### Database Changes (Migration)

**1. Update `is_super_admin()` function** to include `hr@jeanwayusa.com`:
```sql
CREATE OR REPLACE FUNCTION is_super_admin() ...
  (auth.jwt() ->> 'email') IN (
    'andrew@jeanwayusa.com',
    'siadrak@jeanwayusa.com',
    'hr@jeanwayusa.com'
  )
```

**2. Create `subscription_plans` table:**
- `id` (uuid, PK)
- `tier` (text, unique -- solo_bco, fleet_owner, agency, all_in_one)
- `base_price_monthly` (numeric)
- `base_price_annual` (numeric)
- `features_json` (jsonb)
- `is_active` (boolean, default true)
- `created_at`, `updated_at`

RLS: Public SELECT, super-admin-only INSERT/UPDATE/DELETE.

Seed with current hardcoded prices (49/149/99/199 monthly).

**3. Create `promo_codes` table:**
- `id` (uuid, PK)
- `code` (text, unique)
- `discount_percentage` (integer, nullable)
- `discount_amount` (numeric, nullable)
- `valid_from` (timestamptz)
- `valid_until` (timestamptz)
- `max_uses` (integer, nullable)
- `times_used` (integer, default 0)
- `is_global_event` (boolean, default false)
- `description` (text, nullable)
- `created_at`, `updated_at`

RLS: Public SELECT, super-admin-only INSERT/UPDATE/DELETE.

**4. Add `applied_promo_code_id` column to `organizations`:**
- Nullable UUID referencing `promo_codes(id)`

---

### Frontend Changes

**New file: `src/components/superadmin/BillingPromotionsTab.tsx`**

A single component with three sections:

**KPI Row (top):**
- Estimated MRR -- calculated from active orgs x their tier prices (minus complimentary orgs)
- Active Promos -- count of currently valid promo codes
- Total Redemptions -- sum of `times_used` across all promo codes

**Section A: Plan Pricing Management**
- Grid of 4 Cards, one per tier (Solo BCO, Fleet Owner, Agency, All-in-One)
- Each card shows current monthly and annual price
- "Edit Pricing" button opens a Dialog with react-hook-form + Zod validation
- Save calls a direct update on `subscription_plans` (protected by RLS)
- Uses `useMutation` with `onSuccess` invalidation and `toast.promise`

**Section B: Promo Code Engine**
- Table listing all promo codes with columns: Code, Discount, Valid Dates, Usage, Status
- "Create Promo Code" button opens a Dialog form:
  - Custom code text input
  - Discount type selector (percentage or flat amount)
  - Discount value input
  - Valid from/until date pickers
  - Optional max uses
  - Optional description
- Status auto-computed: Active (within date range), Expired, or Exhausted

**Section C: Global Event Sales**
- A distinct Card with a Switch toggle
- When ON, shows/creates a promo code with `is_global_event = true`
- Allows setting event name, discount percentage, and valid dates
- Includes a note that Landing and /pricing pages should fetch active global events to display dynamically

**Update: `src/pages/SuperAdminDashboard.tsx`**
- Import `BillingPromotionsTab`
- Add a 6th tab trigger: "Billing"
- Add corresponding `TabsContent` rendering the new component

---

### Technical Details

- All writes to `subscription_plans` and `promo_codes` are protected by RLS policies that check `is_super_admin()`
- Public SELECT on both tables allows the pricing page to eventually read dynamic prices
- All mutations use TanStack Query `useMutation` with `queryClient.invalidateQueries` on success
- Form submissions wrapped in `toast.promise` for immediate feedback
- The `subscription_plans` table is seeded with the 4 current tiers and their prices so the admin has data immediately
- Annual prices default to 10x monthly (a ~17% discount) as a starting point
- No changes to the Pricing page or Landing page in this implementation -- a code comment will note that those pages should be updated to read from `subscription_plans` and check for active global events




## Plan: Hide Admin Sidebar During Simulation + Add Monthly Bonus Goal Setting

### Overview

Two changes:
1. Hide the Admin section in the sidebar when an owner is simulating a driver or dispatcher role, so the simulated view accurately reflects what those users see
2. Add a Monthly Bonus Goal miles setting to the Admin Settings General tab, stored in `company_settings` and consumed by the `MonthlyBonusWidget`

---

### Part 1: Hide Admin Section During Role Simulation

**Problem:** When an owner simulates the "Driver View" or "Dispatcher View" via the sidebar, the Admin section (Settings link) remains visible because it checks `actuallyIsOwner` which ignores simulation. This means the simulated view doesn't accurately reflect what a real driver or dispatcher sees.

**File: `src/components/layout/AppSidebar.tsx`**
- Change the Admin section condition from `actuallyIsOwner` to `actuallyIsOwner && !isSimulating`
- This hides the Admin section when simulating another role, giving an accurate preview
- The owner can still access Settings by exiting simulation mode via the yellow "Exit" banner at the top of the sidebar
- Line 222: `{actuallyIsOwner && (` becomes `{actuallyIsOwner && !isSimulating && (`

---

### Part 2: Monthly Bonus Goal Setting in Admin Settings

**Problem:** The Monthly Bonus Widget has a hardcoded `TARGET_MILES = 12000` constant. The owner needs to be able to adjust this goal from the Admin Settings without code changes.

**Database:** The `company_settings` table already exists with key-value pairs (gross_percentage, truck_percentage, etc.). We'll add a new row for the bonus goal miles -- no schema migration needed, just an insert if the row doesn't exist.

**File: `src/pages/Settings.tsx`** (General tab)
- Add a "Driver Incentives" card below the "Company Information" card in the General tab
- The card will contain:
  - A number input labeled "Monthly Bonus Goal (Miles)" pre-filled with the current value from `company_settings` (key: `monthly_bonus_miles`)
  - A "Save" button that upserts the value to `company_settings`
- Fetch the current value using a `useQuery` on `company_settings` filtered by `setting_key = 'monthly_bonus_miles'`
- Default to 12,000 if no row exists yet
- On save, upsert the row (insert if new, update if exists)

**File: `src/components/driver/MonthlyBonusWidget.tsx`**
- Remove the hardcoded `const TARGET_MILES = 12000`
- Add a `useQuery` to fetch the `monthly_bonus_miles` setting from `company_settings`
- Parse the value as a number, defaulting to 12,000 if not found
- Use this dynamic value everywhere `TARGET_MILES` was used

---

### Technical Summary

| Action | File | Details |
|--------|------|---------|
| Modify | `src/components/layout/AppSidebar.tsx` | Add `&& !isSimulating` to Admin section visibility check |
| Data insert | `company_settings` table | Insert default `monthly_bonus_miles` = `12000` row if not exists |
| Modify | `src/pages/Settings.tsx` | Add "Driver Incentives" card with miles goal input to General tab |
| Modify | `src/components/driver/MonthlyBonusWidget.tsx` | Replace hardcoded 12000 with dynamic value from `company_settings` |

No database migrations are needed -- the `company_settings` table and its RLS policies already support this use case (owners can manage, admin roles can view).


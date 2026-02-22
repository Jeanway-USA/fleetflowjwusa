

## Add Complimentary Plan Management to Super Admin

Allow super admins to grant any organization free access to their chosen plan -- either permanently or for a set duration.

### How It Works

- A new `is_complimentary` boolean column on the `organizations` table marks whether an org has free access (no payment required).
- A new `complimentary_ends_at` timestamp column is nullable: when `NULL` and `is_complimentary` is `true`, the free access is permanent. When set to a date, the free access expires on that date.
- The existing `super_admin_update_org` RPC is updated to accept and save these two new fields.
- The BillingTab reflects complimentary status so users on a free plan see "Complimentary" instead of trial/payment prompts.

### Database Changes

**Migration: Add complimentary columns to `organizations`**
```sql
ALTER TABLE organizations
  ADD COLUMN is_complimentary boolean NOT NULL DEFAULT false,
  ADD COLUMN complimentary_ends_at timestamptz DEFAULT NULL;
```

**Update RPC: `super_admin_update_org`**
Add two new parameters (`new_is_complimentary` and `new_complimentary_ends_at`) and update the function body to apply them via `COALESCE`.

**Update view: `super_admin_organizations`**
Add the two new columns so the super admin panel can display them.

### UI Changes

**1. `src/components/superadmin/OrgActionsDropdown.tsx`**
- Rename the existing "Manage Trial" dialog to "Manage Plan Access"
- Add a section with:
  - A "Complimentary Access" toggle (Switch)
  - When toggled on, show a radio-style choice: "Permanent" or "Until specific date"
  - If "Until specific date" is chosen, show a date picker for the end date
  - The existing trial controls remain below, separated visually
- Save button calls the updated `super_admin_update_org` RPC with the new parameters

**2. `src/components/superadmin/OrgDetailSheet.tsx`**
- Add a row showing "Plan Access" with a badge: "Complimentary (Permanent)", "Complimentary (until Mar 15, 2027)", or "Standard"
- If complimentary with an end date, show the expiry date

**3. `src/components/settings/BillingTab.tsx`**
- Query the new `is_complimentary` and `complimentary_ends_at` columns
- If complimentary, replace the Trial Status card content with a "Complimentary Plan" indicator showing either "Permanent" or the end date
- Hide the "View Plans and Upgrade" button for permanently complimentary orgs

### Technical Details

- The `super_admin_update_org` function signature changes to:
  ```sql
  CREATE OR REPLACE FUNCTION super_admin_update_org(
    target_org_id uuid,
    new_tier text DEFAULT NULL,
    new_is_active boolean DEFAULT NULL,
    new_trial_ends_at timestamptz DEFAULT NULL,
    new_is_complimentary boolean DEFAULT NULL,
    new_complimentary_ends_at timestamptz DEFAULT NULL
  )
  ```
- The `super_admin_organizations` view needs to be recreated to include `is_complimentary` and `complimentary_ends_at`
- No RLS changes needed since the columns live on `organizations` which already has proper policies
- The `BillingTab` query adds the two new columns to its SELECT


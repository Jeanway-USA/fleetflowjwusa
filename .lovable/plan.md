

## Add Open Beta to Tier Labels in OrgDetailSheet

### Problem
The `TIER_LABELS` map is missing the `open_beta` key, so the "Change Tier" dropdown renders blank for orgs on the Open Beta tier.

### Fix
**File:** `src/components/superadmin/OrgDetailSheet.tsx`

Add `open_beta: 'Open Beta'` to the `TIER_LABELS` record (around line 14). This fixes both the dropdown display and the badge above it.


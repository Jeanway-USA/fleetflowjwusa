

## Fix: Monthly Bonus Goal RLS Violation

### Problem
The `company_settings` table has an RLS policy requiring `org_id` to match the user's organization. The `handleSaveBonusGoal` function in `CompanyTab.tsx` does not include `org_id` when inserting a new row, causing the "new row violates row-level security policy" error.

### Fix
In `src/components/settings/CompanyTab.tsx`, add `org_id` (from `useAuth()`) to the `.insert()` call on line 82:

```typescript
// Before (line 80-85)
const { error } = await supabase
  .from('company_settings')
  .insert({
    setting_key: 'monthly_bonus_miles',
    setting_value: String(miles),
    description: 'Monthly miles goal for driver bonus',
  });

// After
const { error } = await supabase
  .from('company_settings')
  .insert({
    setting_key: 'monthly_bonus_miles',
    setting_value: String(miles),
    description: 'Monthly miles goal for driver bonus',
    org_id: orgId,
  });
```

`orgId` is already destructured from `useAuth()` at the top of the component, so no additional imports or state changes are needed. This is a one-line addition.

### Files Modified
- `src/components/settings/CompanyTab.tsx` -- add `org_id: orgId` to the insert payload (line ~84)


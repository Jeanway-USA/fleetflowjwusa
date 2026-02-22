

## Fix: Company Settings Multi-Tenant Unique Constraint

### Problem
The `company_settings` table has a unique constraint on `setting_key` alone. This means only ONE organization can have a row for `monthly_bonus_miles`. When your organization tries to save, the upsert attempts to update the existing row (owned by the demo org), and RLS correctly blocks it because the `org_id` doesn't match.

### Solution
Two changes are needed:

**1. Database Migration** -- Fix the unique constraint to be per-organization:
- Drop the existing `company_settings_setting_key_key` unique constraint
- Add a new composite unique constraint on `(setting_key, org_id)`

**2. Code Change** -- Update the upsert in `CompanyTab.tsx` to use the new composite conflict target:
- Change `onConflict: 'setting_key'` to `onConflict: 'setting_key,org_id'`

### Technical Details

**Migration SQL:**
```sql
ALTER TABLE public.company_settings
  DROP CONSTRAINT company_settings_setting_key_key;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_setting_key_org_id_key
  UNIQUE (setting_key, org_id);
```

**Code change in `src/components/settings/CompanyTab.tsx`** (line ~84):
```typescript
// Change onConflict from 'setting_key' to 'setting_key,org_id'
{ onConflict: 'setting_key,org_id' }
```

### Why This Works
- Each organization gets its own `monthly_bonus_miles` row
- The upsert correctly inserts a new row for your org (or updates your existing one)
- RLS no longer blocks the operation since it operates on your org's row

### Files Modified
- Database migration (unique constraint change)
- `src/components/settings/CompanyTab.tsx` -- one-line change to `onConflict`




## Fix: Duplicate Key Error on Bonus Goal Save

### Problem
The `company_settings` table has a unique constraint on `setting_key`. A row for `monthly_bonus_miles` already exists from a previous save attempt (the one that succeeded after adding `org_id`). However, the SELECT query fetching `bonusGoalSetting` may not return it due to RLS filtering, so the code tries to INSERT again, hitting the unique constraint.

### Fix
Replace the separate insert/update logic in `handleSaveBonusGoal` with a single **upsert** using `.upsert()` with `onConflict: 'setting_key'`. This handles both cases cleanly.

### Changes

**`src/components/settings/CompanyTab.tsx`** -- replace lines 72-90 (the `handleSaveBonusGoal` function body):

```typescript
const handleSaveBonusGoal = async () => {
  const miles = Number(bonusGoalMiles);
  if (!miles || miles <= 0) {
    toast.error('Please enter a valid number of miles');
    return;
  }
  setIsSavingBonusGoal(true);
  try {
    const { error } = await supabase
      .from('company_settings')
      .upsert(
        {
          setting_key: 'monthly_bonus_miles',
          setting_value: String(miles),
          description: 'Monthly miles goal for driver bonus',
          org_id: orgId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'setting_key' }
      );
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['company-setting', 'monthly_bonus_miles'] });
    toast.success('Bonus goal updated');
  } catch (error: any) {
    toast.error(error.message || 'Failed to save bonus goal');
  } finally {
    setIsSavingBonusGoal(false);
  }
};
```

### Why This Works
- `upsert` with `onConflict: 'setting_key'` inserts if no row exists, updates if it does
- Eliminates the need to check `bonusGoalSetting` before deciding insert vs update
- Includes `org_id` to satisfy RLS policies

### Files Modified
- `src/components/settings/CompanyTab.tsx`

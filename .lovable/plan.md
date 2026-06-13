Remove the "Driver Incentives" card from the Company settings page.

### What to change
- File: `src/components/settings/CompanyTab.tsx`

### Steps
1. Remove the `bonusGoalMiles` state variable, `isSavingBonusGoal` state variable, and the `bonusGoalSetting` query.
2. Remove the `useEffect` that syncs `bonusGoalSetting` into local state.
3. Remove the `handleSaveBonusGoal` async function.
4. Remove the entire "Driver Incentives" `<Card>` block (Trophy icon, miles input, "$0.05/mile bonus" description, and Save button).
5. Remove the `Trophy` import from `lucide-react` since it will no longer be used.
6. Remove the unused `useMutation` import from `@tanstack/react-query`.

### Verification
- Confirm `monthly_bonus_miles` is only referenced inside `CompanyTab.tsx` and is not consumed by any driver-side hooks, widgets, or edge functions. The actual safety-bonus system uses the separate `safety_bonus_settings` / `safety_bonus_tiers` tables via `useSafetyBonus.ts`, so removing this orphaned UI has no downstream impact.
- Build should pass with no lint/type errors after cleanup.
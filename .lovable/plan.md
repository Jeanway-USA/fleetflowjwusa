## Audit summary

The Safety Bonus system is **already mostly tier-driven** — `safety_bonus_settings` + `safety_bonus_tiers` tables, configurable from `SafetyBonusSettings.tsx`, consumed by `useSafetyBonus.ts`, and rendered by `MonthlyBonusWidget.tsx`. There is **no `10000`/`is_10k_eligible` boolean** anywhere in the codebase. The only literal `10,000-mile` reference is one stale copy line in driver settings:

- `src/pages/DriverSettings.tsx:253` — "Pace yourself to hit 2,500 safe miles per week to ensure you unlock your 10,000-mile monthly safety bonus."

Everywhere else (`MaintenanceDashboardHome`, `DriverDashboard`, `DriverSpectatorView`, `Finance`, `TopPerformerCards`, etc.) the `10000` matches are unrelated (numeric formatters, animation z-index, alternator lifespan miles, etc.).

The current widget already renders a tier-aware progress bar, but it only surfaces "X mi to next rate jump" — it doesn't make the **Current Tier → Next Tier** structure visually explicit.

## Changes

### 1. UI text clean-up — `src/pages/DriverSettings.tsx` (line ~253)
Replace the hardcoded "10,000-mile monthly safety bonus" sentence with a tier-agnostic prompt that reflects the driver's actual configured target (`targetMiles` is already in scope):

```
Aim for steady weekly progress to hit your {targetMiles.toLocaleString()}-mile target and climb to the next safety-bonus tier.
```

When `targetMiles` is 0/unset, fall back to: "Aim for steady weekly progress to climb to the next safety-bonus tier."

### 2. Hook surface — `src/hooks/useSafetyBonus.ts`
Extend `SafetyBonusStatus` and `computeSafetyBonus` to expose tier metadata the UI needs (without altering existing fields, so other consumers keep working):

- `currentTier: { index: number; minMiles: number; maxMiles: number | null; ratePerMile: number } | null`
- `nextTier:    { index: number; minMiles: number; maxMiles: number | null; ratePerMile: number } | null`
- `tierCount: number`

Derived from the same `tiers` array already fetched — pure refactor, no extra queries.

### 3. Widget refactor — `src/components/driver/MonthlyBonusWidget.tsx`
Replace the single anonymous progress bar with a tiered display:

- Header row: two badges side-by-side
  - **Current Tier**: `Tier {currentTier.index + 1} of {tierCount}` + `$X.XX/mi`
  - **Next Tier**: `Tier {nextTier.index + 1}` + `$Y.YY/mi` (or "Top tier reached" pill when `nextTier == null`)
- Progress bar segment now scales between `currentTier.minMiles` and `nextTier.minMiles` (or the cap on the top tier), so it visually represents progress **within the current tier toward the next**, not just toward an arbitrary total.
- Sub-label under the bar: `{formatMiles(currentSafeMiles - currentTier.minMiles)} / {formatMiles(nextTier.minMiles - currentTier.minMiles)} mi into Tier N` (or "Top tier — max rate active" at the cap).
- "X days left in period" stays.

No layout/size regression — same Card footprint.

### 4. No DB or settings changes
The existing schema already supports unbounded tiers (`min_miles` / nullable `max_miles` / `rate_per_mile`). No migration needed. `SafetyBonusSettings.tsx` already lets owners add/edit any number of tiers — leaving it untouched.

## Files touched
- `src/pages/DriverSettings.tsx` — copy fix
- `src/hooks/useSafetyBonus.ts` — add `currentTier` / `nextTier` / `tierCount` to returned status
- `src/components/driver/MonthlyBonusWidget.tsx` — current/next tier badges + tier-relative progress bar

## Out of scope
- No changes to `SafetyBonusSettings.tsx`, the `safety_bonus_*` tables, or any other component.
- No change to disqualifier rules, max bonus cap, or period length logic.

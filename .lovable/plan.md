## Plan: Rebuild `MonthlyBonusWidget` around `useSafetyBonus`

Replace the current `monthly_bonus_miles` / hardcoded $0.05 logic in `src/components/driver/MonthlyBonusWidget.tsx` with the new tier-driven `useSafetyBonus(driverId)` hook. Keep the existing component name and props (`{ driverId }`) so all Driver Dashboard call sites keep working with no other changes.

### Behavior

- **Loading**: render the card shell with a `Skeleton` for the bonus amount + progress bar.
- **No settings configured** (`hasSettings === false`): render a muted "Bonus program not set up yet" state so the widget gracefully no-ops for orgs that haven't configured tiers.
- **Disqualified** (`isEligible === false`): destructive-tinted card.
  - Icon: `ShieldAlert` in `text-destructive`.
  - Heading: "Bonus paused for this period".
  - Body: list which disqualifier(s) tripped (accident / CSA citation / service failure) from `disqualifiers`.
  - Encouragement: "Your next 4-week period resets in N days — clean record from then earns the full bonus." `N` = days between today and `periodEnd + 1 day`.
- **Eligible** (`isEligible === true`):
  - Large currency display of `currentEarnedBonus` (`Intl.NumberFormat` USD) with `Trophy`/`Sparkles` icon.
  - Sub-heading: `{formatMiles(currentSafeMiles)} safe miles this period`.
  - Progress bar (shadcn `Progress`) toward the next tier:
    - `value = (currentSafeMiles / (currentSafeMiles + nextTierMiles)) * 100` when `nextTierMiles != null`.
    - When at top tier (`nextTierMiles == null`): show `value = 100`, label "Top tier reached".
  - Helper line under the bar: `"X mi to next rate jump"` (or "Max tier") and `Period ends {date}`.
  - Footer line: `Current rate: $0.05/mile · Max bonus: $500.00` (formatted from `currentRate` and `maxBonus`).
  - Keep the existing confetti effect, but trigger when `currentEarnedBonus >= maxBonus` (cap hit) instead of the old miles target — once per mount via `useRef`.

### Visual

- Use semantic tokens only — `border-primary/20`, `text-primary`, `text-destructive`, `bg-destructive/10`, `text-muted-foreground`. No raw colors.
- Card structure stays the same (`Card` → `CardHeader` with title → `CardContent` with stacked sections, `space-y-3`).
- Currency: `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.
- Miles: existing `formatMiles` helper.

### Files touched

- `src/components/driver/MonthlyBonusWidget.tsx` — full rewrite of internals; props and export signature unchanged.

No other files, hooks, or DB changes needed.

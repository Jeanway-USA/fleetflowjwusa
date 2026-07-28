## What's actually happening

The bonus is not missing — it is being calculated correctly, just for a different month than the one the screen is showing.

Verified in the database:
- Timothy Ames has 5,862 delivered miles in **July 2026**, which lands in the 4,000–5,999 tier at $0.05/mi → **$93.10**.
- A payout row for July 2026 already exists with `earned_amount = 93.10`, status pending.
- For **June 2026** the same driver has only 3,432 miles → $0.00.

The Safety Bonus Payouts card defaults its month selector to the **previous** month whenever today is past the 1st (`SafetyBonusPayouts.tsx`, lines 76–80). So the page opens on June, "Generate for month" regenerates June, and the driver shows $0 — while the Driver Dashboard bonus widget (`useSafetyBonus.ts`) always uses the **current calendar month** and shows $93. Same driver, two different periods, no visible indication of which is being shown.

## Changes

1. **Default to the current month** in `src/components/finance/SafetyBonusPayouts.tsx` — remove the "past the 1st → previous month" rule so the payouts card matches what drivers see on their dashboards.

2. **Make the active period explicit.** Show the period range (e.g. "Jul 1 – Jul 31, 2026") next to the month selector, and label the button "Generate for July 2026" instead of the generic "Generate for month" so it is obvious which month is being written.

3. **Flag in-progress months.** When the selected month is the current one, show a small "Month in progress — totals will change" note so a partial-month snapshot isn't mistaken for a final figure.

4. **Reconciliation hint per row.** When a generated payout's `safe_miles` is 0 but the driver has delivered miles in a *different* month, that is not something the table can know — instead, keep it simple: after generating, if every driver comes back with $0, surface a hint that another month may have the activity.

## Technical notes

- Frontend-only change; the `generate_safety_bonus_payouts` function, tiers, and settings are all computing correctly and need no migration.
- The month list (current + 12 prior) stays as-is, so June can still be selected and regenerated.

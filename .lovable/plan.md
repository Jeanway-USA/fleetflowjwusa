
## Problems

1. **Bonus over-pays.** `useSafetyBonus.ts` computes `currentEarnedBonus = currentSafeMiles * currentRate`. Once the driver hits Tier 2 (e.g. 4,000 mi at $0.10), every mile from mile 1 gets $0.10 retroactively. It should be **marginal**: each tier's rate only applies to miles inside that tier.
2. **Period isn't monthly.** The hook computes `endDate = now`, `startDate = now − periodDays` (defaults to a rolling 28-day window). The widget already shows "this month" / "resets end of month". Result: the dollar amount and safe miles never actually reset on the 1st. It needs to be scoped to the **calendar month** (1st → last day).
3. **No payout record.** Nothing stores that a bonus was earned/paid for a given month, so once the month rolls over the earned amount is lost with no audit trail and no way to include it in a settlement/payroll run.

## Fix

### 1. Marginal tier calculation (`src/hooks/useSafetyBonus.ts`)

Replace the single-multiplication earn calc with a marginal walk across tiers:

```text
earned = 0
for each tier (sorted by min_miles):
  if miles <= tier.min_miles: break
  ceiling  = tier.max_miles ?? miles
  inTier   = min(miles, ceiling) - tier.min_miles
  earned  += inTier * tier.rate_per_mile
earned = min(earned, max_bonus)
```

`currentRate` (displayed) stays as the rate of the tier the driver is currently in — that's already correct and matches the "Current rate" line.

Example with the screenshot's tiers (Tier 1 = 2,000–3,999 mi @ $0.05, Tier 2 = 4,000+ @ $0.10) at 4,696 miles:

```text
Tier 1: (min(4696, 4000) − 2000) × 0.05  = 2000 × 0.05 = $100.00
Tier 2: (4696 − 4000) × 0.10            =  696 × 0.10 = $69.60
Total                                     = $169.60
```

(Today's buggy math would show `4696 × 0.05 = $234.80`, which matches the screenshot and confirms the bug.)

### 2. Calendar-month period (`src/hooks/useSafetyBonus.ts`)

- Replace the rolling `endDate − periodDays` window with `startOfMonth(now)` / `endOfMonth(now)` (via `date-fns`, matching what `MonthlyBonusWidget` already displays).
- Use those bounds for `fleet_loads.delivery_date`, `incidents.incident_date`, and the service-failure query.
- Keep `period_length_days` in `safety_bonus_settings` for now (the settings UI still writes it) but stop using it for the math. Note in the plan that this field is effectively deprecated for math; we can hide it in the settings UI in a follow-up if desired.
- The widget's "resets in Nd" / "Resets tomorrow" copy already lines up with a calendar month — no change needed there.

### 3. Bonus payout ledger

New table `safety_bonus_payouts` (migration) so we can record and pay out earned bonuses:

```text
id             uuid pk
org_id         uuid not null
driver_id      uuid not null
period_start   date not null      -- first of month
period_end     date not null      -- last of month
safe_miles     integer not null
earned_amount  numeric(10,2) not null
status         text not null default 'pending'   -- pending | approved | paid | void
paid_at        timestamptz
paid_in_settlement_id uuid        -- optional link to driver_settlements
notes          text
created_by     uuid
created_at     timestamptz default now()
updated_at     timestamptz default now()
unique (driver_id, period_start)
```

- Standard GRANT + RLS (owner/payroll_admin manage; driver reads own; org-scoped).
- Add a "Safety Bonus Payouts" panel inside the existing `SafetyBonusSettings` card on the Finance page:
  - Month selector (defaults to previous month once we're past the 1st).
  - Table: driver, safe miles, tier reached, earned amount, status, action.
  - "Generate for month" button: runs the same marginal calc server-side (RPC `generate_safety_bonus_payouts(_org_id, _period_start)`) and inserts a row per eligible driver with `status='pending'`. Idempotent via the unique key.
  - Per-row actions: Approve, Mark Paid, Void.
- On the driver widget, show a small "Last month: $X — {status}" line under the current-period card once a payout row exists so the driver can see the earned bonus was recorded.

Out of scope for this change: automatic inclusion into settlement PDFs / driver_settlements line items. The ledger + status flag is enough to "record and pay out"; wiring it into a settlement run can be a follow-up if you want.

## Technical Notes

- Files touched:
  - `src/hooks/useSafetyBonus.ts` — marginal calc + calendar-month window.
  - `src/components/driver/MonthlyBonusWidget.tsx` — no logic change; verify labels still read correctly with the new numbers.
  - `src/components/finance/SafetyBonusSettings.tsx` — add Payouts section.
  - New migration: `safety_bonus_payouts` table (GRANT, RLS, trigger for `updated_at`) + `generate_safety_bonus_payouts` SECURITY DEFINER RPC that recomputes marginal earnings for each active driver in the org for the given month and upserts rows.
- The RPC re-uses the same tier walk logic so the widget and the ledger can never drift.
- Eligibility checks (accidents / CSA / service failures) run inside the RPC against the same month window; ineligible drivers get `earned_amount = 0` and `status = 'void'` with a reason in `notes`.
- Query keys for `useSafetyBonus` stay keyed by `driverId`; add the current `YYYY-MM` to the key so a month rollover invalidates cleanly.

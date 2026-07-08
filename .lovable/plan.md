# Fleet Driver Retention & Performance Analytics Board

Enhance the existing performance module with a rolling-window revenue leaderboard, a 4-week safety-bonus progress ring on each scorecard, and a low-key retention flag when a driver's monthly mileage falls sharply below their baseline.

## 1. Rolling-window data in `useDriverPerformanceData.ts`

- Extend `PerformancePeriod` with three new options used by the new leaderboard: `'week'` (current week), `'30d'` (rolling 30 days), `'ytd'` (year-to-date). Keep the existing monthly options intact for the scorecards.
- Update `getPeriodRange` to handle the new values (using `startOfWeek`/`endOfWeek`, `subDays(now, 30)`, `startOfYear`).
- Add three per-driver retention/bonus fields to `DriverMetric`, computed independently of the selected period so the badges are stable across tabs:
  - `bonusWeeks` (0–4): count of consecutive completed weeks in the last 4 weeks with ≥1 delivered load and zero incidents (any severity). Resets to 0 when a week has an incident.
  - `baselineMonthlyMiles`: average monthly miles across the trailing 6 full months, excluding the current month.
  - `currentMonthMiles`: miles delivered in the current calendar month.
  - `retentionFlag`: `true` when `baselineMonthlyMiles > 0` AND `currentMonthMiles` is more than 25% below baseline AND at least 10 days into the month (avoid false positives early in the month).
- Return `bonusWeeks`, `baselineMonthlyMiles`, `currentMonthMiles`, `retentionFlag` on every `DriverMetric`.

## 2. Fleet Revenue Leaderboard card in `PerformanceLeaderboard.tsx`

- Add a new top card **"Fleet Revenue Leaderboard"** rendered above the existing Driver Rankings table (still keyed off the parent's `metrics`/`selectedDriver`).
- Local `useState` for `window: 'week' | '30d' | 'ytd'` with a small `Tabs` (or ToggleGroup) header: **Current Week · 30 Days · YTD**.
- Because the parent hook is keyed to a single period, the leaderboard card calls `useDriverPerformanceData(window)` itself to get an independent metric set for the chosen rolling window. Sort by `totalRevenue` desc, take top 10.
- Row layout (compact, no full table): rank chip · driver name · `Total Gross Generated` (right-aligned success color) · `Clean Miles Logged` (muted). Highlight the row if it matches `selectedDriver`.
- Empty state reuses `EmptyState` with the `Trophy` icon.
- Leave the existing Driver Rankings table unchanged below.

## 3. Bonus milestone ring + retention tag in `PerformanceScorecards.tsx`

- Add a small SVG progress ring component inline (48px, `stroke-primary` for progress, `stroke-muted` track, 4-segment tick marks at 25/50/75/100%). Center label shows `{bonusWeeks}/4`.
- Place the ring in the card header row, right side, replacing/next-to the Trophy for non-podium drivers; keep Trophy for top 3 and put the ring immediately to its left.
- Tooltip on the ring: "Consecutive clean weeks toward monthly Safety & Performance Bonus. Zero incidents required."
- When `bonusWeeks === 4`, ring fills fully and shows a subtle `bg-success/10` badge "Bonus Earned" under the driver name.
- Add a low-profile blue tag under the score badge when `retentionFlag` is true:
  - Uses `Badge` with `className="bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/10"` and copy **"Retention Review Required"**.
  - Tooltip: "Monthly mileage is {pctDrop}% below the 6-month baseline. Audit routing and coordinate with agents."
- No changes to score math or existing progress rows.

## Out of scope

- No new tables, RLS changes, or edge functions.
- No changes to bonus payout amounts or accounting flows — the ring is purely a visual milestone tracker.
- No changes to the period selector at the parent page level; the leaderboard card owns its own rolling-window state.

## Technical notes

- Bonus weeks use `startOfWeek(now, { weekStartsOn: 1 })` and iterate backward 4 completed weeks; a week counts as "clean" only if it has ≥1 delivered load in that window AND no `incidents` rows for the driver in that same window.
- Baseline mileage sums `actual_miles` from `delivered` loads keyed by `delivery_date` month, over the prior 6 completed months. Skip drivers with <2 months of data (baseline undefined ⇒ `retentionFlag = false`).
- The new leaderboard card mounts a second `useDriverPerformanceData` call — this is intentional and cheap given queries are cached by TanStack (`drivers`, `fleet_loads`, `incidents`, `fuel_purchases` keys are shared).

## Files touched

- `src/hooks/useDriverPerformanceData.ts` — extend period type, add rolling fields, compute bonusWeeks/baseline/retentionFlag.
- `src/components/performance/PerformanceLeaderboard.tsx` — add Fleet Revenue Leaderboard card with window tabs above existing table.
- `src/components/performance/PerformanceScorecards.tsx` — add bonus progress ring and retention tag.

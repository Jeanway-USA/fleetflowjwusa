## Goal
Conditionally render a mileage-focused weekly widget on the Driver Dashboard for Flat Rate drivers, and keep the existing pay widget for everyone else.

## Files

**New:** `src/components/driver/WeeklyPerformanceWidget.tsx`
**Edit:** `src/pages/DriverDashboard.tsx`

## Note on `pay_type` value
Internally the driver's flat pay type is stored as `'flat'` (see `src/lib/pay-format.ts` and existing `DriverSettings.tsx` `isFlatRate` check). The user request says `'Flat Rate'` as the human label — the conditional will use `driver.pay_type === 'flat'` to match the DB/codebase convention. Display label remains "Flat Rate".

## DriverDashboard.tsx changes
- Import `WeeklyPerformanceWidget`.
- Where `<DriverPayWidget …/>` is rendered (line ~213), branch on `driver.pay_type`:
  - `'flat'` → `<WeeklyPerformanceWidget driverId={driver.id} />`
  - else → existing `<DriverPayWidget …/>` unchanged.
- No other dashboard changes.

## WeeklyPerformanceWidget.tsx

Props: `{ driverId: string }`

### Data fetched (TanStack Query, same patterns as DriverPayWidget)
1. `driver_settings_safe` → `target_miles`, `pay_week_start_day` (for `target_miles` goal + week boundary).
2. This week's `fleet_loads` for the driver where `delivery_date` is within current pay-week and `status = 'delivered'` — provides loaded miles & rate context.
3. Driver's deadhead miles for the week: sum `deadhead_miles` (if present on `fleet_loads`) — if column missing we'll derive as 0 and surface a TODO; will verify column at build time.
4. Month-to-date delivered miles for the driver (loads delivered between start of current month and today) — used for bonus pacing.

### Derived values
- `milesThisWeek` = sum of `booked_miles` for week's delivered loads.
- `targetMiles` = `driver_settings_safe.target_miles ?? 2500`.
- `weekProgressPct` = `min(100, milesThisWeek / targetMiles * 100)`.
- `monthMiles` = sum of `booked_miles` for current month's delivered loads.
- `daysElapsedInMonth` = today's day-of-month.
- `dailyVelocity` = `monthMiles / daysElapsedInMonth`.
- `projectedMonthMiles` = `dailyVelocity * daysInCurrentMonth`.
- `bonusPaceStatus`:
  - `>= 10000` projected → "On Pace" (success token).
  - `>= 9000` and `< 10000` → "Slightly Behind" (warning token).
  - `< 9000` → "Off Pace" (destructive token).
- `loadedMiles` = `milesThisWeek`.
- `deadheadMiles` = sum of `deadhead_miles` for week (fallback 0).
- `deadheadPct` = `loadedMiles + deadheadMiles > 0 ? deadheadMiles / (loadedMiles + deadheadMiles) * 100 : 0`.

### UI (Card + semantic design tokens only)
```text
┌─ Weekly Performance ───────────────────────────┐
│  MILES DRIVEN THIS WEEK                        │
│  2,143  ← large bold number                    │
│  of 2,500 mile target                          │
│  [============------]  86%                     │
│                                                │
│  Monthly Bonus Pacing       [On Pace] badge    │
│  Projected: 10,420 / 10,000 safe miles         │
│                                                │
│  Deadhead Percentage         8.4%              │
│  120 empty / 1,423 loaded miles                │
└────────────────────────────────────────────────┘
```
- Use `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Progress`, `Badge`, lucide icons (`Gauge`, `Target`, `TrendingUp`).
- All colors via Tailwind semantic tokens (`text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-success`, `bg-warning`, `bg-destructive` etc.).

### Verification step during build
Before final code, confirm whether `fleet_loads.deadhead_miles` exists; if not, render the deadhead row with a graceful "—" placeholder and a tooltip "Deadhead tracking coming soon" rather than fabricating data.

## Out of scope
- No changes to `WeeklyPayWidget`, settings page, or DB schema.
- No new edge functions or migrations.
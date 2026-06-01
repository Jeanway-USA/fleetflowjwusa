## Remove Monthly Bonus Pacing from WeeklyPerformanceWidget

In `src/components/driver/WeeklyPerformanceWidget.tsx`:

1. Remove the "Monthly Bonus Pacing" block (Target/TrendingUp section) entirely.
2. Remove now-unused code: `monthlyLoads` query, `monthStart`/`monthEnd`, `monthMiles`, `daysElapsed`/`daysInMonth`, `dailyVelocity`, `projectedMonthMiles`, `paceLabel`/`paceVariant`/`paceBadgeClass`, `MONTHLY_BONUS_TARGET` constant.
3. Remove unused imports: `Badge`, `Target`, `TrendingUp`, `startOfMonth`, `endOfMonth`, `getDate`, `getDaysInMonth`.

Widget will then show only: Miles Driven This Week (with progress vs target) + Deadhead Percentage. The MonthlyBonusWidget below already covers safety/bonus tracking.
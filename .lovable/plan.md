## Fix Safety & Performance Bonus 'days left' counter

### Problem
The `MonthlyBonusWidget` shows `1d left` (or `Resets tomorrow`) because its `daysToReset` helper uses `periodEnd` returned by `useSafetyBonus`. That hook computes `periodEnd = today` for a rolling 28-day window, so the counter is effectively always near zero.

### Goal
Make the widget's time-left badge reflect the **remaining days in the current calendar month** (e.g., `30d left` on the 1st, `1d left` on the 30th/31st).

### Changes

**File: `src/components/driver/MonthlyBonusWidget.tsx`**

1. **Import** `differenceInDays` and `endOfMonth` from `date-fns`.
2. **Replace** the `daysToReset` IIFE (lines 54-61) with a calendar-month calculation:
   - Get `today` with time zeroed.
   - Compute `monthEnd = endOfMonth(today)`.
   - Compute `daysToReset = Math.max(differenceInDays(monthEnd, today) + 1, 0)`.
   - The `+ 1` makes the count **inclusive** of today, so e.g. June 1st → `30d left`.
3. **Remove** the unused `periodEnd` value from the `useSafetyBonus` destructuring.
4. **Keep** the existing display strings (`X d left`, `Resets tomorrow`, `a fresh period starts tomorrow`) — they will now behave correctly because `daysToReset` will be `0` only when `today` has somehow passed `endOfMonth` (should not happen in normal operation).

### Verification
- June 1  →  `30d left`
- June 15 →  `16d left`
- June 30 →  `1d left`
- July 1  →  `31d left`

No database or hook logic changes required; this is a pure display-layer fix in the widget.
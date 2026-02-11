
# Fix: Pickup Date Timezone Offset in Upcoming Pickups

## Problem
The Upcoming Pickups card shows "Feb 10, 4:00 PM" for a load with pickup_date `2026-02-11`. JavaScript's `new Date('2026-02-11')` interprets date-only strings as UTC midnight, which shifts backward when converted to the user's local timezone (e.g., Central Time = Feb 10, 6:00 PM).

## Solution
Apply the project's established date-handling standard: append `T00:00:00` to date-only strings before parsing. This forces local timezone interpretation.

## Technical Details

### File: `src/components/dispatcher/UpcomingPickups.tsx`

Create a helper to safely parse pickup dates:

```typescript
const parsePickupDate = (dateStr: string) => {
  // If date-only (no T), append T00:00:00 to force local timezone
  if (!dateStr.includes('T')) return new Date(dateStr + 'T00:00:00');
  return new Date(dateStr);
};
```

Replace all `new Date(load.pickup_date)` calls (lines 80, 135, 138) with `parsePickupDate(load.pickup_date)`.

Also fix the query filters (lines 48-49) which compare ISO timestamps against date-only values -- these should use date strings instead of `toISOString()` to avoid the same UTC offset issue in filtering.

### Files Modified
- `src/components/dispatcher/UpcomingPickups.tsx` -- fix all date parsing to use local timezone

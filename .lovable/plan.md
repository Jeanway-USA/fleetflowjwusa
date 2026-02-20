

## Add Configurable Pay Week Start Day

Right now the "My Pay This Week" widget always uses a Sunday-to-Saturday calendar week. With Landstar, your pay cycle is based on your scan day -- for example, if your scan day is Monday at 2 PM EST, your pay week runs Monday to Sunday. This change lets each driver pick their scan day so the weekly progress dates match their actual settlement cycle.

### What changes

1. **New database column** -- Add `pay_week_start_day` (integer, 0=Sunday through 6=Saturday, default 0) to the `driver_settings` table so each driver can store their preferred week start.

2. **Driver Settings page** -- Add a "Pay Week Start Day" dropdown (Sun/Mon/Tue/Wed/Thu/Fri/Sat) in the Weekly Goals card. It saves alongside the existing goals. A helper note will explain: "Set this to your Landstar scan day so weekly progress matches your settlement cycle."

3. **Pay Widget** -- Instead of hardcoding `startOfWeek(new Date(), { weekStartsOn: 0 })`, read the driver's `pay_week_start_day` from the settings query and use it as the `weekStartsOn` value. The date range label (e.g., "Feb 17 - Feb 23") will automatically reflect the custom cycle.

### Technical details

**Database migration:**
```sql
ALTER TABLE public.driver_settings
ADD COLUMN pay_week_start_day integer NOT NULL DEFAULT 0;
```

**`src/pages/DriverSettings.tsx`:**
- Add state for `payWeekStartDay` (default 0)
- Load it from `driver_settings` query (add to select)
- Add a Select dropdown with day-of-week options in the Goals card
- Include it in the save goals mutation payload

**`src/components/driver/DriverPayWidget.tsx`:**
- Expand the `driver-settings` query to also fetch `pay_week_start_day`
- Use `startOfWeek(new Date(), { weekStartsOn: driverSettings?.pay_week_start_day ?? 0 })` and matching `endOfWeek`
- No other logic changes needed -- the date range and query filters automatically adjust


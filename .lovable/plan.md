

## Plan: Fix Incident Report Crash + Improve Driver Performance Page

### Issue 1: "+ Report Incident" Button Crashes the App

**Root Cause:** The incident report form uses `<SelectItem value="">None</SelectItem>` for the Driver, Truck, and Trailer dropdowns (lines 403, 416, 428 in Incidents.tsx). Radix UI's Select component does NOT allow empty string values -- it throws an unrecoverable error that crashes the entire page.

**Fix (File: `src/pages/Incidents.tsx`):**
- Replace `<SelectItem value="">None</SelectItem>` with `<SelectItem value="none">None</SelectItem>` for all three dropdowns (Driver, Truck, Trailer)
- Update the `onValueChange` handlers to convert `"none"` back to `null` (e.g., `v === 'none' ? null : v`)
- Update the `value` props to convert `null` to `"none"` (e.g., `formData.driver_id || 'none'`)
- Wrap the `handleSubmit` and mutation logic in proper try/catch to prevent future unhandled errors from crashing the page
- Also fix the `as any` type cast on the insert (line 122) to show actual error messages in the toast

---

### Issue 2: Driver Performance Page Improvements

The current page has several gaps that make it hard to understand and act on the data. Here are the planned improvements:

#### A. Add Scoring Methodology Explanations

Currently, the scores are calculated with hardcoded thresholds but never explained to the user. This makes the metrics meaningless without context.

**Changes:**
- Add an info section at the top of the page (collapsible) titled "How Scores Are Calculated" that explains each metric:
  - **Productivity (25%):** Based on loads completed. 10+ loads/month = 100%
  - **Safety (25%):** Starts at 100%, minus 10 points per incident, minus 20 extra for major/critical incidents
  - **Compliance (25%):** Percentage of clean DVIR inspections (no defects found)
  - **Revenue (25%):** Based on net revenue generated. $20,000+/month = 100%
- Add tooltip icons next to each score label in the scorecards that show a brief explanation on hover

#### B. Add Fuel Efficiency Metrics

The `fuel_purchases` table has gallons and cost data per driver. The Driver Stats page already calculates MPG -- this data should also appear on the Performance page.

**Changes:**
- Add a new query to fetch `fuel_purchases` data grouped by driver
- Calculate MPG (total miles / total gallons) and Cost per Mile (total fuel cost / total miles) for each driver
- Add these metrics to the leaderboard table as two new columns: "MPG" and "Fuel $/Mi"
- Add a fuel efficiency progress bar to each scorecard
- Color-code MPG values: green for 6.5+ MPG, yellow for 5.5-6.5, red for below 5.5

#### C. Fix TrendIndicator Division by Zero

The `TrendIndicator` component crashes or shows incorrect results when the fleet average is 0 (e.g., when no loads have been delivered).

**Fix:** Add a guard: if `average === 0`, return the neutral indicator (dash icon)

#### D. Add Empty State for No Data

When there are no drivers or no loads in the selected period, the page shows empty tables with no guidance.

**Changes:**
- Add an empty state message when no driver metrics are available: "No performance data available for the selected period. Delivered loads, inspections, and incident data are used to calculate scores."
- Show the same message in the charts tab when there's no chart data

#### E. Add Individual Driver Filter

The `selectedDriver` state variable exists but is never used. Wire it up so users can filter the view to a single driver.

**Changes:**
- Add a driver filter dropdown next to the period selector
- When a specific driver is selected, the leaderboard highlights that row, and the scorecards tab shows only that driver's card (expanded with more detail)

---

### Technical Summary

| Action | File | Details |
|--------|------|---------|
| Fix crash | `src/pages/Incidents.tsx` | Replace empty-string SelectItem values with "none", fix type cast, add error handling |
| Improve | `src/pages/DriverPerformance.tsx` | Add scoring explanations, fuel efficiency metrics, driver filter, empty states, fix division by zero |

No database migrations are needed. The `fuel_purchases` table already has the data and RLS policies needed for the performance page queries.


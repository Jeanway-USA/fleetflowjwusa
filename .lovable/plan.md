

## Plan: Show Only Date in Fleet Loads Table

**File: `src/pages/FleetLoads.tsx`** (line 586-591)

Remove the pickup time display from the Date column render. Change from a `<div>` with date + time to just `formatDate(load.pickup_date)`.


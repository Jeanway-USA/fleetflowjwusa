

## Plan: Remove TimeTypeBadge from Fleet Loads Table

**File: `src/pages/FleetLoads.tsx`**

- Remove the `TimeTypeBadge` import (line 26)
- In the pickup_date column render (around line 587-590), remove the `TimeTypeBadge` component and just show the date and time as plain text
- Check if there's also a delivery date column using `TimeTypeBadge` and remove it there too

This is a simple cleanup — the time type selectors in the create/edit form will remain so users can still set the type; it just won't show badges in the table.

